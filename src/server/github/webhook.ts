import { invalidateInstallationToken } from '#/server/github/installation-token-cache'
import {
  findRepositoryIdentity,
  findRepositoryIdentityByExternalId,
  observeRepositoryIdentity,
  RepositoryIdentityConflictError,
} from '#/server/access/repository-identity'

import { normalizeGitPath } from '#/shared/git-path'

import type { Database } from '#/server/db/client'
import type { GitHubApi } from '#/server/github/api'
import {
  DEFAULT_REPOSITORY_SOURCE,
  isRepositoryProviderError,
} from '#/server/repository/provider'
import type { RepositoryChange } from '#/server/cache/repository'
import { applyRepositoryPush } from '#/server/cache/repository'
import { createConfigurationStore } from '#/server/cache/configuration'
import type { ConfigurationStore } from '#/server/cache/configuration'
import { cachePolicy } from '#/server/cache/policy'
import { safelyCapturePushActivity } from '#/server/activity/webhook'
import { revokeCollaborators } from '#/server/collaborators/collaborators'
import { invalidateRepositoryReads } from '#/server/cache/repository-read'
import { staleDirectoryCache } from '#/server/cache/directory'

import { executeAtomic } from '#/server/db/core'
import { all, repositoryAddressQuery } from '#/server/db/sql'

const encoder = new TextEncoder()

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function string(value: unknown) {
  return typeof value === 'string' && value ? value : null
}

function number(value: unknown) {
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : null
}

function hexBytes(value: string) {
  if (!/^[a-f0-9]{64}$/i.test(value)) return null
  return Uint8Array.from(value.match(/.{2}/g) ?? [], (byte) =>
    Number.parseInt(byte, 16),
  )
}

export async function verifyGitHubWebhookSignature(
  secret: string,
  body: string,
  signature: string | null,
) {
  if (!signature?.startsWith('sha256=')) return false
  const bytes = hexBytes(signature.slice(7))
  if (!bytes) return false
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  )
  return crypto.subtle.verify('HMAC', key, bytes, encoder.encode(body))
}

function repositoryCoordinates(payload: Record<string, unknown>) {
  const repository = record(payload.repository)
  const owner = record(repository?.owner)
  const ownerName = string(owner?.login)
  const repo = string(repository?.name)
  return ownerName && repo ? { owner: ownerName, repo } : null
}

async function clearBranch(
  database: Database,
  owner: string,
  repo: string,
  branch: string,
  clearConfiguration = true,
  repositoryId?: number,
) {
  invalidateRepositoryReads(owner, repo)
  const identity =
    repositoryId === undefined
      ? repositoryAddressQuery(DEFAULT_REPOSITORY_SOURCE, owner, repo).sql
      : '?'
  const args = [
    DEFAULT_REPOSITORY_SOURCE,
    ...(repositoryId === undefined
      ? repositoryAddressQuery(DEFAULT_REPOSITORY_SOURCE, owner, repo).args
      : [repositoryId]),
    branch,
  ]
  const tables = [
    'cache_file',
    'cache_file_meta',
    ...(clearConfiguration ? ['config'] : []),
  ]
  await executeAtomic(
    database,
    tables.map((table) => ({
      sql: `DELETE FROM ${table} WHERE source = ? AND repository_id = ${identity} AND branch = ?`,
      args,
    })),
  )
}

async function clearOwner(database: Database, owner: string) {
  invalidateRepositoryReads(owner, undefined, DEFAULT_REPOSITORY_SOURCE)
  await executeAtomic(
    database,
    ['cache_file', 'cache_file_meta', 'config'].map((table) => ({
      sql: `DELETE FROM ${table} WHERE source = ? AND repository_id IN
      (SELECT id FROM repository WHERE source = ? AND lower(owner) = ?)`,
      args: [
        DEFAULT_REPOSITORY_SOURCE,
        DEFAULT_REPOSITORY_SOURCE,
        owner.toLowerCase(),
      ],
    })),
  )
}

async function clearRepository(
  database: Database,
  owner: string,
  repo: string,
  repositoryId?: number,
) {
  invalidateRepositoryReads(owner, repo, DEFAULT_REPOSITORY_SOURCE)
  const identity =
    repositoryId === undefined
      ? repositoryAddressQuery(DEFAULT_REPOSITORY_SOURCE, owner, repo).sql
      : '?'
  const args = [
    DEFAULT_REPOSITORY_SOURCE,
    ...(repositoryId === undefined
      ? repositoryAddressQuery(DEFAULT_REPOSITORY_SOURCE, owner, repo).args
      : [repositoryId]),
  ]
  await executeAtomic(
    database,
    ['cache_file', 'cache_file_meta', 'config'].map((table) => ({
      sql: `DELETE FROM ${table} WHERE source = ? AND repository_id = ${identity}`,
      args,
    })),
  )
}

async function renameCachedCoordinates(
  database: Database,
  oldOwner: string,
  newOwner: string,
  oldRepo?: string,
  newRepo?: string,
  ownerId?: number,
) {
  invalidateRepositoryReads(oldOwner, oldRepo, DEFAULT_REPOSITORY_SOURCE)
  invalidateRepositoryReads(newOwner, newRepo, DEFAULT_REPOSITORY_SOURCE)
  const rows = await all<{
    id: number
    source: string
    repo: string
    externalId: string | null
    ownerId: string | null
  }>(
    database,
    `SELECT id, source, repo, external_id AS externalId, owner_id AS ownerId
    FROM repository WHERE source = ? AND lower(owner) = lower(?)
      ${oldRepo ? 'AND lower(repo) = lower(?)' : ''}`,
    [DEFAULT_REPOSITORY_SOURCE, oldOwner, ...(oldRepo ? [oldRepo] : [])],
  )
  for (const row of rows) {
    if (row.externalId) {
      if (ownerId !== undefined && row.ownerId !== String(ownerId)) continue
      const destination = await findRepositoryIdentity(database, {
        owner: newOwner,
        repo: newRepo ?? row.repo,
        source: row.source,
      })
      // A stale row must not take an address already bound to another repo.
      if (destination?.externalId && destination.id !== row.id) continue
      await observeRepositoryIdentity(
        database,
        {
          source: row.source,
          id: row.externalId,
          ...(row.ownerId ? { ownerId: row.ownerId } : {}),
          owner: newOwner,
          repo: newRepo ?? row.repo,
        },
        { owner: oldOwner, repo: oldRepo ?? row.repo },
      )
    } else {
      // Detach the unverified address, but keep durable history separate from
      // any repository that later claims the same coordinates.
      await executeAtomic(database, [
        ...[
          'cache_file',
          'cache_file_meta',
          'config',
          'repository_address',
        ].map((table) => ({
          sql: `DELETE FROM ${table} WHERE repository_id = ? AND EXISTS
              (SELECT 1 FROM repository WHERE id = ? AND external_id IS NULL)`,
          args: [row.id, row.id],
        })),
        {
          sql: `DELETE FROM repository WHERE id = ? AND external_id IS NULL
              AND NOT EXISTS (SELECT 1 FROM activity WHERE repository_id = ?)
              AND NOT EXISTS (SELECT 1 FROM action_run WHERE repository_id = ?)`,
          args: [row.id, row.id, row.id],
        },
      ])
    }
  }
}

async function handlePush(
  cacheDatabase: Database,
  payload: Record<string, unknown>,
  configurationStore: ConfigurationStore,
  resolveApi?: (
    installationId: number,
    repository?: { id: number; nodeId?: string },
  ) => Promise<GitHubApi>,
) {
  const coordinates = repositoryCoordinates(payload)
  const ref = string(payload.ref)
  if (!coordinates || !ref?.startsWith('refs/heads/')) return
  const branch = ref.slice('refs/heads/'.length)
  if (!branch) return
  const externalId = number(record(payload.repository)?.id)
  const identity =
    externalId === null
      ? null
      : await findRepositoryIdentityByExternalId(
          cacheDatabase,
          String(externalId),
        )
  if (externalId !== null && !identity) return
  const repositoryId = identity?.id
  if (payload.deleted === true)
    return clearBranch(
      cacheDatabase,
      coordinates.owner,
      coordinates.repo,
      branch,
      true,
      repositoryId,
    )
  const changes = repositoryPushChanges(payload)
  const before = string(payload.before)
  const after = string(payload.after)
  const installationId = number(record(payload.installation)?.id)
  const configurationChanged =
    changes === null || changes.some((change) => change.path === '.pages.yml')
  if (
    configurationChanged &&
    (!changes || !resolveApi || installationId === null)
  ) {
    await configurationStore.remove(
      coordinates.owner,
      coordinates.repo,
      branch,
      DEFAULT_REPOSITORY_SOURCE,
      repositoryId,
    )
  }
  if (!changes || !resolveApi || installationId === null) {
    return staleDirectoryCache(
      cacheDatabase,
      coordinates.owner,
      coordinates.repo,
      branch,
      undefined,
      undefined,
      DEFAULT_REPOSITORY_SOURCE,
      repositoryId,
    )
  }
  let api: Promise<GitHubApi> | undefined
  const getApi = () =>
    (api ??= resolveApi(
      installationId,
      externalId === null
        ? undefined
        : {
            id: externalId,
            nodeId: string(record(payload.repository)?.node_id) ?? undefined,
          },
    ))
  try {
    if (configurationChanged) {
      const cached = await configurationStore.find(
        coordinates.owner,
        coordinates.repo,
        branch,
        DEFAULT_REPOSITORY_SOURCE,
        repositoryId,
      )
      let client: GitHubApi
      try {
        client = await getApi()
      } catch (error) {
        if (cached)
          await configurationStore.remove(
            coordinates.owner,
            coordinates.repo,
            branch,
            DEFAULT_REPOSITORY_SOURCE,
            repositoryId,
            cached,
          )
        throw error
      }
      await configurationStore.refresh(
        client,
        coordinates.owner,
        coordinates.repo,
        branch,
        identity?.externalId ?? undefined,
        identity?.externalId
          ? {
              id: identity.id,
              externalId: identity.externalId,
              source: identity.source,
            }
          : undefined,
        { removeOnError: true, cached },
      )
    }
    if (!before || !after)
      return staleDirectoryCache(
        cacheDatabase,
        coordinates.owner,
        coordinates.repo,
        branch,
        undefined,
        undefined,
        DEFAULT_REPOSITORY_SOURCE,
        repositoryId,
      )
    const policy = cachePolicy(cacheDatabase)
    if (
      (policy.scopedMax > 0 && changes.length > policy.scopedMax) ||
      (policy.incrementalMax > 0 && changes.length > policy.incrementalMax)
    ) {
      return staleDirectoryCache(
        cacheDatabase,
        coordinates.owner,
        coordinates.repo,
        branch,
        policy.scopedMax > 0 && changes.length > policy.scopedMax
          ? undefined
          : changes.map((change) => change.path),
        after,
        DEFAULT_REPOSITORY_SOURCE,
        repositoryId,
      )
    }
    await applyRepositoryPush(
      cacheDatabase,
      { source: DEFAULT_REPOSITORY_SOURCE, getApi },
      {
        ...coordinates,
        repositoryId,
        branch,
        before,
        after,
        changes,
        ...pushCommitDate(payload, after),
      },
    )
  } catch (error) {
    await staleDirectoryCache(
      cacheDatabase,
      coordinates.owner,
      coordinates.repo,
      branch,
      undefined,
      undefined,
      DEFAULT_REPOSITORY_SOURCE,
      repositoryId,
    )
    throw error
  }
}

async function handleWorkflowRun(
  database: Database,
  payload: Record<string, unknown>,
) {
  const workflowRun = record(payload.workflow_run)
  const id = number(workflowRun?.id)
  if (id === null) return
  const status = string(workflowRun?.status) ?? 'completed'
  const updatedAtValue = string(workflowRun?.updated_at)
  const updatedAt = updatedAtValue ? new Date(updatedAtValue) : new Date()
  await executeAtomic(database, [
    {
      sql: `UPDATE action_run SET status = ?, conclusion = ?, html_url = ?,
      updated_at = ?, checked_at = ?, completed_at = ?
      WHERE workflow_run_id = ? AND (updated_at < ? OR
        (updated_at = ? AND (status <> 'completed' OR ? = 'completed')))`,
      args: [
        status,
        string(workflowRun?.conclusion),
        string(workflowRun?.html_url),
        updatedAt.getTime(),
        Date.now(),
        status === 'completed' ? updatedAt.getTime() : null,
        id,
        updatedAt.getTime(),
        updatedAt.getTime(),
        status,
      ],
    },
  ])
}

async function handleInstallation(
  database: Database,
  cacheDatabase: Database,
  payload: Record<string, unknown>,
  waitUntil?: (promise: Promise<unknown>) => void,
) {
  if (payload.action !== 'deleted') return
  const installation = record(payload.installation)
  const installationId = number(installation?.id)
  const account = record(installation?.account)
  const owner = string(account?.login)
  if (installationId === null) return
  // Application and cache databases can be separate: revoke access first,
  // then perform idempotent cache cleanup so a retry can safely finish it.
  await revokeCollaborators(
    database,
    { sql: 'collaborator.installation_id = ?', args: [installationId] },
    undefined,
    undefined,
    undefined,
    waitUntil,
  )
  invalidateInstallationToken(installationId)
  await executeAtomic(cacheDatabase, [
    {
      sql: 'DELETE FROM github_installation_token WHERE installation_id = ?',
      args: [installationId],
    },
  ])
  if (owner) {
    await clearOwner(cacheDatabase, owner)
  }
}

async function handleInstallationRepositories(
  database: Database,
  cacheDatabase: Database,
  payload: Record<string, unknown>,
  waitUntil?: (promise: Promise<unknown>) => void,
) {
  if (payload.action !== 'removed') return
  const repositories = Array.isArray(payload.repositories_removed)
    ? payload.repositories_removed.flatMap((value) => {
        const repository = record(value)
        const id = number(repository?.id)
        const fullName = string(repository?.full_name)
        return id === null ? [] : [{ id, fullName }]
      })
    : []
  if (!repositories.length) return
  const removedRepositories = {
    sql: `collaborator.repo_id IN (${repositories.map(() => '?').join(', ')})`,
    args: repositories.map((repository) => repository.id),
  }
  await revokeCollaborators(
    database,
    removedRepositories,
    undefined,
    undefined,
    undefined,
    waitUntil,
  )
  await Promise.all(
    repositories.flatMap(({ fullName }) => {
      if (!fullName) return []
      const separator = fullName.indexOf('/')
      if (separator <= 0) return []
      return [
        clearRepository(
          cacheDatabase,
          fullName.slice(0, separator),
          fullName.slice(separator + 1),
        ),
      ]
    }),
  )
}

async function handleDelete(
  cacheDatabase: Database,
  payload: Record<string, unknown>,
) {
  if (payload.ref_type !== 'branch') return
  const coordinates = repositoryCoordinates(payload)
  const branch = string(payload.ref)
  if (!coordinates || !branch) return
  const externalId = number(record(payload.repository)?.id)
  const identity =
    externalId === null
      ? null
      : await findRepositoryIdentityByExternalId(
          cacheDatabase,
          String(externalId),
        )
  if (externalId !== null && !identity) return
  await clearBranch(
    cacheDatabase,
    coordinates.owner,
    coordinates.repo,
    branch,
    true,
    identity?.id,
  )
}

export async function handleGitHubWebhook(
  database: Database,
  event: string,
  payload: unknown,
  resolveApi?: (
    installationId: number,
    repository?: { id: number; nodeId?: string },
  ) => Promise<GitHubApi>,
  cacheDatabase: Database = database,
  resolveInstallationAccount?: (
    installationId: number,
  ) => Promise<{ id: number; login: string }>,
  waitUntil?: (promise: Promise<unknown>) => void,
  configurationStore = createConfigurationStore({ database: cacheDatabase }),
) {
  const data = record(payload)
  if (!data) throw new Error('Invalid GitHub webhook payload')
  // Ignore unrelated deliveries before touching storage or credentials.
  if (
    ['push', 'repository', 'delete'].includes(event) &&
    !(event === 'repository' && data.action === 'deleted')
  ) {
    const repository = record(data.repository)
    const owner = record(repository?.owner)
    const coordinates = repositoryCoordinates(data)
    const id = number(repository?.id)
    if (coordinates && id !== null) {
      if (number(owner?.id) === null) return
      const invalidateUnverified = async () => {
        const known = await findRepositoryIdentityByExternalId(
          cacheDatabase,
          String(id),
        )
        const ref = string(data.ref)
        const branch =
          event === 'push' && ref?.startsWith('refs/heads/')
            ? ref.slice('refs/heads/'.length)
            : event === 'delete' && data.ref_type === 'branch'
              ? ref
              : null
        if (!known || !branch) return
        if (event === 'delete' || data.deleted === true) {
          await clearBranch(
            cacheDatabase,
            coordinates.owner,
            coordinates.repo,
            branch,
            true,
            known.id,
          )
        } else {
          await staleDirectoryCache(
            cacheDatabase,
            coordinates.owner,
            coordinates.repo,
            branch,
            undefined,
            undefined,
            DEFAULT_REPOSITORY_SOURCE,
            known.id,
          )
          await executeAtomic(cacheDatabase, [
            {
              sql: 'DELETE FROM config WHERE repository_id = ? AND source = ? AND branch = ?',
              args: [known.id, DEFAULT_REPOSITORY_SOURCE, branch],
            },
          ])
        }
      }
      const oldName =
        event === 'repository' && data.action === 'renamed'
          ? string(record(record(record(data.changes)?.repository)?.name)?.from)
          : null
      const stores = [...new Set([database, cacheDatabase])]
      const observe = (fresh: boolean) =>
        Promise.all(
          stores.map(async (store) => {
            const old = oldName
              ? { owner: coordinates.owner, repo: oldName }
              : undefined
            const oldIdentity = old
              ? await findRepositoryIdentity(store, old)
              : null
            const historical =
              !oldIdentity?.externalId || oldIdentity.externalId === String(id)
                ? old
                : undefined
            await observeRepositoryIdentity(
              store,
              {
                ...coordinates,
                id,
                ...(number(owner?.id) !== null
                  ? { ownerId: number(owner?.id)! }
                  : {}),
              },
              historical,
              { readOnlyIfMatches: !fresh },
            )
          }),
        )
      try {
        await observe(false)
      } catch (error) {
        if (!(error instanceof RepositoryIdentityConflictError)) throw error
        const scopes = await Promise.all(
          stores.map(async (store) =>
            Promise.all([
              findRepositoryIdentityByExternalId(store, String(id)),
              findRepositoryIdentity(store, coordinates),
              oldName
                ? findRepositoryIdentity(store, {
                    owner: coordinates.owner,
                    repo: oldName,
                  })
                : null,
            ]),
          ),
        )
        if (!scopes.some((rows) => rows.some(Boolean))) return
        const installationId = number(record(data.installation)?.id)
        const ownerId = number(owner?.id)
        if (!resolveApi || installationId === null || ownerId === null) {
          await invalidateUnverified()
          return
        }
        let verified
        try {
          verified = await (
            await resolveApi(installationId)
          ).getRepository(coordinates.owner, coordinates.repo, { fresh: true })
        } catch (failure) {
          await invalidateUnverified()
          if (isRepositoryProviderError(failure, 404)) return
          throw failure
        }
        if (
          verified.id !== id ||
          verified.ownerId !== ownerId ||
          verified.owner.toLowerCase() !== coordinates.owner.toLowerCase() ||
          verified.repo.toLowerCase() !== coordinates.repo.toLowerCase()
        ) {
          await invalidateUnverified()
          return
        }
        await observe(true)
      }
    }
  }
  switch (event) {
    case 'push': {
      const coordinates = repositoryCoordinates(data)
      const ref = string(data.ref)
      const externalId = number(record(data.repository)?.id)
      const cacheIdentity =
        externalId === null
          ? null
          : await findRepositoryIdentityByExternalId(
              cacheDatabase,
              String(externalId),
            )
      const previous =
        coordinates &&
        ref?.startsWith('refs/heads/') &&
        (externalId === null || cacheIdentity)
          ? await configurationStore.find(
              coordinates.owner,
              coordinates.repo,
              ref.slice('refs/heads/'.length),
              undefined,
              cacheIdentity?.id,
            )
          : null
      try {
        return await handlePush(
          cacheDatabase,
          data,
          configurationStore,
          resolveApi,
        )
      } finally {
        const activity = safelyCapturePushActivity(
          database,
          cacheDatabase,
          data,
          previous?.object ?? null,
          configurationStore,
        )
        if (waitUntil) waitUntil(activity)
        else await activity
      }
    }
    case 'workflow_run':
      return handleWorkflowRun(database, data)
    case 'installation':
      return handleInstallation(database, cacheDatabase, data, waitUntil)
    case 'installation_repositories':
      return handleInstallationRepositories(
        database,
        cacheDatabase,
        data,
        waitUntil,
      )
    case 'delete':
      return handleDelete(cacheDatabase, data)
    case 'repository': {
      const coordinates = repositoryCoordinates(data)
      const repository = record(data.repository)
      const repositoryId = number(repository?.id)
      const cacheIdentity =
        repositoryId === null
          ? null
          : await findRepositoryIdentityByExternalId(
              cacheDatabase,
              String(repositoryId),
            )
      const changes = record(data.changes)
      if (data.action === 'renamed') {
        const repositoryChanges = record(changes?.repository)
        const oldName = string(record(repositoryChanges?.name)?.from)
        if (!coordinates || !oldName || repositoryId === null) return
        // The verified identity observation above already updates this
        // repository's records. The old name may now belong to another repo.
        invalidateRepositoryReads(
          coordinates.owner,
          oldName,
          DEFAULT_REPOSITORY_SOURCE,
        )
        invalidateRepositoryReads(
          coordinates.owner,
          coordinates.repo,
          DEFAULT_REPOSITORY_SOURCE,
        )
        return
      }
      if (data.action === 'transferred') {
        const newOwnerId = number(record(repository?.owner)?.id)
        if (repositoryId !== null && newOwnerId !== null)
          await revokeCollaborators(
            database,
            {
              sql: 'collaborator.repo_id = ? AND collaborator.owner_id != ?',
              args: [repositoryId, newOwnerId],
            },
            undefined,
            undefined,
            undefined,
            waitUntil,
          )
        const oldOwnerChange = record(record(changes?.owner)?.from)
        const oldOwner = string(oldOwnerChange?.login)
        if (oldOwner && coordinates) {
          if (cacheIdentity)
            await clearRepository(
              cacheDatabase,
              oldOwner,
              coordinates.repo,
              cacheIdentity.id,
            )
        }
      } else if (data.action === 'deleted' && coordinates) {
        if (repositoryId !== null)
          await revokeCollaborators(
            database,
            { sql: 'collaborator.repo_id = ?', args: [repositoryId] },
            undefined,
            undefined,
            undefined,
            waitUntil,
          )
        if (cacheIdentity)
          await clearRepository(
            cacheDatabase,
            coordinates.owner,
            coordinates.repo,
            cacheIdentity.id,
          )
      } else {
        return
      }
      return
    }
    case 'installation_target': {
      if (data.action !== 'renamed') return
      const changes = record(data.changes)
      const oldOwner = string(record(changes?.login)?.from)
      const account = record(data.account)
      const newOwner = string(account?.login)
      const ownerId = number(account?.id)
      if (!oldOwner || !newOwner || ownerId === null) return
      const stores = [...new Set([database, cacheDatabase])]
      if (resolveInstallationAccount) {
        const installationId = number(record(data.installation)?.id)
        if (installationId === null) return
        const current = await resolveInstallationAccount(installationId)
        if (
          current.id !== ownerId ||
          current.login.toLowerCase() !== newOwner.toLowerCase()
        ) {
          invalidateRepositoryReads(
            oldOwner,
            undefined,
            DEFAULT_REPOSITORY_SOURCE,
          )
          invalidateRepositoryReads(
            newOwner,
            undefined,
            DEFAULT_REPOSITORY_SOURCE,
          )
          return
        }
        await Promise.all([
          ...stores.map((store) =>
            renameCachedCoordinates(
              store,
              oldOwner,
              newOwner,
              undefined,
              undefined,
              ownerId,
            ),
          ),
          executeAtomic(database, [
            {
              sql: 'UPDATE collaborator SET owner = ? WHERE owner_id = ?',
              args: [newOwner, ownerId],
            },
          ]),
        ])
        return
      }
      const candidateRows = (
        await Promise.all(
          stores.map((store) =>
            all<{ externalId: string; repo: string }>(
              store,
              `SELECT external_id AS externalId, repo FROM repository
              WHERE source = ? AND lower(owner) = lower(?) AND owner_id = ?
                AND external_id IS NOT NULL LIMIT 3`,
              [DEFAULT_REPOSITORY_SOURCE, oldOwner, String(ownerId)],
            ),
          ),
        )
      ).flat()
      const candidates = [
        ...new Map(candidateRows.map((row) => [row.externalId, row])).values(),
      ].slice(0, 3)
      if (candidates.length) {
        const installationId = number(record(data.installation)?.id)
        if (!resolveApi || installationId === null) {
          invalidateRepositoryReads(
            oldOwner,
            undefined,
            DEFAULT_REPOSITORY_SOURCE,
          )
          invalidateRepositoryReads(
            newOwner,
            undefined,
            DEFAULT_REPOSITORY_SOURCE,
          )
          return
        }
        const api = await resolveApi(installationId)
        let matches = false
        for (const candidate of candidates) {
          try {
            const verified = await api.getRepository(newOwner, candidate.repo, {
              fresh: true,
            })
            if (
              String(verified.id) === candidate.externalId &&
              verified.ownerId === ownerId &&
              verified.owner.toLowerCase() === newOwner.toLowerCase()
            ) {
              matches = true
              break
            }
          } catch (error) {
            if (!isRepositoryProviderError(error, 404)) throw error
          }
        }
        if (!matches) {
          invalidateRepositoryReads(
            oldOwner,
            undefined,
            DEFAULT_REPOSITORY_SOURCE,
          )
          invalidateRepositoryReads(
            newOwner,
            undefined,
            DEFAULT_REPOSITORY_SOURCE,
          )
          console.warn(
            JSON.stringify({
              event: 'github_account_rename_unverified',
              ownerId,
            }),
          )
          return
        }
      }
      await Promise.all([
        ...stores.map((store) =>
          renameCachedCoordinates(
            store,
            oldOwner,
            newOwner,
            undefined,
            undefined,
            ownerId,
          ),
        ),
        ...(candidates.length
          ? [
              executeAtomic(database, [
                {
                  sql: 'UPDATE collaborator SET owner = ? WHERE owner_id = ?',
                  args: [newOwner, ownerId],
                },
              ]),
            ]
          : []),
      ])
      return
    }
    default:
      return
  }
}

function pushCommitDate(payload: Record<string, unknown>, after: string) {
  const head = record(payload.head_commit)
  const timestamp = string(head?.timestamp)
  return string(head?.id) === after &&
    timestamp &&
    Number.isFinite(Date.parse(timestamp))
    ? { commitTimestamp: new Date(timestamp).toISOString() }
    : {}
}

export function repositoryPushChanges(
  payload: Record<string, unknown>,
): RepositoryChange[] | null {
  if (
    payload.forced === true ||
    payload.created === true ||
    !Array.isArray(payload.commits)
  )
    return null
  const commits = payload.commits
  if (
    commits.length >= 2048 ||
    (typeof payload.size === 'number' && payload.size > commits.length)
  )
    return null
  const changes = new Map<string, RepositoryChange>()
  for (const value of commits) {
    const commit = record(value)
    if (!commit) return null
    for (const kind of ['added', 'modified', 'removed']) {
      if (!Array.isArray(commit[kind])) return null
      for (const changedPath of commit[kind]) {
        if (typeof changedPath !== 'string') return null
        const path = normalizeGitPath(changedPath)
        const timestamp = string(commit.timestamp)
        const sha = string(commit.id)
        changes.set(path, {
          path,
          removed: kind === 'removed',
          ...(sha && timestamp && Number.isFinite(Date.parse(timestamp))
            ? {
                commitSha: sha,
                commitTimestamp: new Date(timestamp).toISOString(),
              }
            : {}),
        })
      }
    }
  }
  if (!commits.length && payload.before !== payload.after) return null
  return [...changes.values()]
}
