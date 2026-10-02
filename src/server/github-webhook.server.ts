import { and, eq, inArray, sql } from 'drizzle-orm'
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core'

import { normalizeGitPath } from '#/lib/git-path'

import type { Database } from './database/client.server'
import type { GitHubApi } from './github-api.server'
import { DEFAULT_REPOSITORY_SOURCE } from './repository-provider.server'
import type { RepositoryChange } from './repository-cache.server'
import { applyRepositoryPush } from './repository-cache.server'
import { createConfigurationStore } from './configuration-store.server'
import { cachePolicy } from './cache-policy.server'
import { invalidateRepositoryReads } from './repository-read-cache.server'
import {
  staleDirectoryCache,
  invalidateEphemeralMediaDirectories,
} from './directory-cache.server'

import {
  actionRunTable,
  cacheFileMetaTable,
  cacheFileTable,
  collaboratorTable,
  configTable,
  githubInstallationTokenTable,
} from './database/schema'
import { databaseStatement, executeAtomic } from './database/core.server'

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
) {
  invalidateEphemeralMediaDirectories(owner, repo, branch)
  const coordinates = and(
    eq(cacheFileTable.source, DEFAULT_REPOSITORY_SOURCE),
    eq(cacheFileTable.owner, owner.toLowerCase()),
    eq(cacheFileTable.repo, repo.toLowerCase()),
    eq(cacheFileTable.branch, branch),
  )
  const metaCoordinates = and(
    eq(cacheFileMetaTable.source, DEFAULT_REPOSITORY_SOURCE),
    eq(cacheFileMetaTable.owner, owner.toLowerCase()),
    eq(cacheFileMetaTable.repo, repo.toLowerCase()),
    eq(cacheFileMetaTable.branch, branch),
  )
  const configCoordinates = and(
    eq(configTable.source, DEFAULT_REPOSITORY_SOURCE),
    eq(configTable.owner, owner.toLowerCase()),
    eq(configTable.repo, repo.toLowerCase()),
    eq(configTable.branch, branch),
  )
  const queries = [
    database.delete(cacheFileTable).where(coordinates),
    database.delete(cacheFileMetaTable).where(metaCoordinates),
    ...(clearConfiguration
      ? [database.delete(configTable).where(configCoordinates)]
      : []),
  ]
  await executeAtomic(database, queries.map(databaseStatement))
}

async function clearOwner(database: Database, owner: string) {
  invalidateRepositoryReads(owner, undefined, DEFAULT_REPOSITORY_SOURCE)
  const normalizedOwner = owner.toLowerCase()
  await executeAtomic(database, [
    databaseStatement(
      database
        .delete(cacheFileTable)
        .where(
          and(
            eq(cacheFileTable.source, DEFAULT_REPOSITORY_SOURCE),
            eq(cacheFileTable.owner, normalizedOwner),
          ),
        ),
    ),
    databaseStatement(
      database
        .delete(cacheFileMetaTable)
        .where(
          and(
            eq(cacheFileMetaTable.source, DEFAULT_REPOSITORY_SOURCE),
            eq(cacheFileMetaTable.owner, normalizedOwner),
          ),
        ),
    ),
    databaseStatement(
      database
        .delete(configTable)
        .where(
          and(
            eq(configTable.source, DEFAULT_REPOSITORY_SOURCE),
            eq(configTable.owner, normalizedOwner),
          ),
        ),
    ),
  ])
}

async function clearRepository(
  database: Database,
  owner: string,
  repo: string,
) {
  invalidateRepositoryReads(owner, repo, DEFAULT_REPOSITORY_SOURCE)
  const normalizedOwner = owner.toLowerCase()
  const normalizedRepo = repo.toLowerCase()
  await executeAtomic(database, [
    databaseStatement(
      database
        .delete(cacheFileTable)
        .where(
          and(
            eq(cacheFileTable.source, DEFAULT_REPOSITORY_SOURCE),
            eq(cacheFileTable.owner, normalizedOwner),
            eq(cacheFileTable.repo, normalizedRepo),
          ),
        ),
    ),
    databaseStatement(
      database
        .delete(cacheFileMetaTable)
        .where(
          and(
            eq(cacheFileMetaTable.source, DEFAULT_REPOSITORY_SOURCE),
            eq(cacheFileMetaTable.owner, normalizedOwner),
            eq(cacheFileMetaTable.repo, normalizedRepo),
          ),
        ),
    ),
    databaseStatement(
      database
        .delete(configTable)
        .where(
          and(
            eq(configTable.source, DEFAULT_REPOSITORY_SOURCE),
            eq(configTable.owner, normalizedOwner),
            eq(configTable.repo, normalizedRepo),
          ),
        ),
    ),
  ])
}

async function renameCachedCoordinates(
  database: Database,
  oldOwner: string,
  newOwner: string,
  oldRepo?: string,
  newRepo?: string,
) {
  invalidateRepositoryReads(oldOwner, oldRepo, DEFAULT_REPOSITORY_SOURCE)
  invalidateRepositoryReads(newOwner, newRepo, DEFAULT_REPOSITORY_SOURCE)
  if (
    oldOwner.toLowerCase() === newOwner.toLowerCase() &&
    oldRepo?.toLowerCase() === newRepo?.toLowerCase()
  )
    return
  const normalizedOldOwner = oldOwner.toLowerCase()
  const normalizedNewOwner = newOwner.toLowerCase()
  const normalizedOldRepo = oldRepo?.toLowerCase()
  const normalizedNewRepo = newRepo?.toLowerCase()
  const source = <
    T extends {
      source: AnySQLiteColumn
      owner: AnySQLiteColumn
      repo: AnySQLiteColumn
    },
  >(
    table: T,
  ) =>
    and(
      eq(table.source, DEFAULT_REPOSITORY_SOURCE),
      eq(table.owner, normalizedOldOwner),
      normalizedOldRepo ? eq(table.repo, normalizedOldRepo) : undefined,
    )
  const nextRepo = (repo: AnySQLiteColumn) =>
    normalizedNewRepo ? sql`${normalizedNewRepo}` : repo

  await executeAtomic(database, [
    databaseStatement(
      database.delete(cacheFileTable).where(
        and(
          source(cacheFileTable),
          sql`exists (select 1 from ${cacheFileTable} as destination
          where destination.source = ${DEFAULT_REPOSITORY_SOURCE}
          and destination.owner = ${normalizedNewOwner}
          and destination.repo = ${nextRepo(cacheFileTable.repo)}
          and destination.branch = ${cacheFileTable.branch}
          and destination.path = ${cacheFileTable.path}
          and destination.context = ${cacheFileTable.context})`,
        ),
      ),
    ),
    databaseStatement(
      database
        .update(cacheFileTable)
        .set({
          owner: normalizedNewOwner,
          ...(normalizedNewRepo ? { repo: normalizedNewRepo } : {}),
        })
        .where(source(cacheFileTable)),
    ),
    databaseStatement(
      database.delete(cacheFileMetaTable).where(
        and(
          source(cacheFileMetaTable),
          sql`exists (select 1 from ${cacheFileMetaTable} as destination
          where destination.source = ${DEFAULT_REPOSITORY_SOURCE}
          and destination.owner = ${normalizedNewOwner}
          and destination.repo = ${nextRepo(cacheFileMetaTable.repo)}
          and destination.branch = ${cacheFileMetaTable.branch}
          and destination.path = ${cacheFileMetaTable.path}
          and destination.context = ${cacheFileMetaTable.context})`,
        ),
      ),
    ),
    databaseStatement(
      database
        .update(cacheFileMetaTable)
        .set({
          owner: normalizedNewOwner,
          ...(normalizedNewRepo ? { repo: normalizedNewRepo } : {}),
        })
        .where(source(cacheFileMetaTable)),
    ),
    databaseStatement(
      database.delete(configTable).where(
        and(
          source(configTable),
          sql`exists (select 1 from ${configTable} as destination
          where destination.source = ${DEFAULT_REPOSITORY_SOURCE}
          and destination.owner = ${normalizedNewOwner}
          and destination.repo = ${nextRepo(configTable.repo)}
          and destination.branch = ${configTable.branch})`,
        ),
      ),
    ),
    databaseStatement(
      database
        .update(configTable)
        .set({
          owner: normalizedNewOwner,
          ...(normalizedNewRepo ? { repo: normalizedNewRepo } : {}),
        })
        .where(source(configTable)),
    ),
  ])
}

async function handlePush(
  cacheDatabase: Database,
  payload: Record<string, unknown>,
  resolveApi?: (installationId: number) => Promise<GitHubApi>,
) {
  const coordinates = repositoryCoordinates(payload)
  const ref = string(payload.ref)
  if (!coordinates || !ref?.startsWith('refs/heads/')) return
  const branch = ref.slice('refs/heads/'.length)
  if (!branch) return
  if (payload.deleted === true)
    return clearBranch(
      cacheDatabase,
      coordinates.owner,
      coordinates.repo,
      branch,
    )
  const changes = repositoryPushChanges(payload)
  const before = string(payload.before)
  const after = string(payload.after)
  const installationId = number(record(payload.installation)?.id)
  const configurationChanged =
    changes === null || changes.some((change) => change.path === '.pages.yml')
  if (configurationChanged) {
    await cacheDatabase
      .delete(configTable)
      .where(
        and(
          eq(configTable.source, DEFAULT_REPOSITORY_SOURCE),
          eq(configTable.owner, coordinates.owner.toLowerCase()),
          eq(configTable.repo, coordinates.repo.toLowerCase()),
          eq(configTable.branch, branch),
        ),
      )
  }
  if (!changes || !before || !after || !resolveApi || installationId === null) {
    return staleDirectoryCache(
      cacheDatabase,
      coordinates.owner,
      coordinates.repo,
      branch,
    )
  }
  try {
    const api = await resolveApi(installationId)
    if (configurationChanged) {
      // Rehydrate the normalized configuration during the webhook, as legacy did.
      // Read the current branch, so a delayed delivery cannot restore an old config.
      await createConfigurationStore({ database: cacheDatabase }).refresh(
        api,
        coordinates.owner,
        coordinates.repo,
        branch,
      )
    }
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
      )
    }
    await applyRepositoryPush(cacheDatabase, api, {
      ...coordinates,
      branch,
      before,
      after,
      changes,
    })
  } catch (error) {
    await staleDirectoryCache(
      cacheDatabase,
      coordinates.owner,
      coordinates.repo,
      branch,
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
  await database
    .update(actionRunTable)
    .set({
      status,
      conclusion: string(workflowRun?.conclusion),
      htmlUrl: string(workflowRun?.html_url),
      updatedAt,
      completedAt: status === 'completed' ? updatedAt : null,
    })
    .where(eq(actionRunTable.workflowRunId, id))
}

async function handleInstallation(
  database: Database,
  cacheDatabase: Database,
  payload: Record<string, unknown>,
) {
  if (payload.action !== 'deleted') return
  const installation = record(payload.installation)
  const installationId = number(installation?.id)
  const account = record(installation?.account)
  const owner = string(account?.login)
  if (installationId === null) return
  await Promise.all([
    database
      .delete(collaboratorTable)
      .where(eq(collaboratorTable.installationId, installationId)),
    cacheDatabase
      .delete(githubInstallationTokenTable)
      .where(eq(githubInstallationTokenTable.installationId, installationId)),
  ])
  if (owner) {
    await clearOwner(cacheDatabase, owner)
  }
}

async function handleInstallationRepositories(
  database: Database,
  cacheDatabase: Database,
  payload: Record<string, unknown>,
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
  await database.delete(collaboratorTable).where(
    inArray(
      collaboratorTable.repoId,
      repositories.map((repository) => repository.id),
    ),
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
  await clearBranch(cacheDatabase, coordinates.owner, coordinates.repo, branch)
}

export async function handleGitHubWebhook(
  database: Database,
  event: string,
  payload: unknown,
  resolveApi?: (installationId: number) => Promise<GitHubApi>,
  cacheDatabase: Database = database,
) {
  const data = record(payload)
  if (!data) throw new Error('Invalid GitHub webhook payload')
  switch (event) {
    case 'push':
      return handlePush(cacheDatabase, data, resolveApi)
    case 'workflow_run':
      return handleWorkflowRun(database, data)
    case 'installation':
      return handleInstallation(database, cacheDatabase, data)
    case 'installation_repositories':
      return handleInstallationRepositories(database, cacheDatabase, data)
    case 'delete':
      return handleDelete(cacheDatabase, data)
    case 'repository': {
      const coordinates = repositoryCoordinates(data)
      const repository = record(data.repository)
      const repositoryId = number(repository?.id)
      const changes = record(data.changes)
      if (data.action === 'renamed') {
        const repositoryChanges = record(changes?.repository)
        const oldName = string(record(repositoryChanges?.name)?.from)
        if (!coordinates || !oldName || repositoryId === null) return
        await Promise.all([
          renameCachedCoordinates(
            cacheDatabase,
            coordinates.owner,
            coordinates.owner,
            oldName,
            coordinates.repo,
          ),
          database
            .update(collaboratorTable)
            .set({ repo: coordinates.repo })
            .where(eq(collaboratorTable.repoId, repositoryId)),
        ])
        return
      }
      if (data.action === 'transferred') {
        const oldOwnerChange = record(record(changes?.owner)?.from)
        const oldOwner = string(oldOwnerChange?.login)
        if (oldOwner && coordinates) {
          await clearRepository(cacheDatabase, oldOwner, coordinates.repo)
        }
      } else if (data.action === 'deleted' && coordinates) {
        await clearRepository(
          cacheDatabase,
          coordinates.owner,
          coordinates.repo,
        )
      } else {
        return
      }
      if (repositoryId !== null) {
        await database
          .delete(collaboratorTable)
          .where(eq(collaboratorTable.repoId, repositoryId))
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
      await Promise.all([
        renameCachedCoordinates(cacheDatabase, oldOwner, newOwner),
        database
          .update(collaboratorTable)
          .set({ owner: newOwner })
          .where(eq(collaboratorTable.ownerId, ownerId)),
      ])
      return
    }
    default:
      return
  }
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
  // GitHub caps the embedded commit list. An incomplete list cannot establish a complete snapshot.
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
        changes.set(path, { path, removed: kind === 'removed' })
      }
    }
  }
  if (!commits.length && payload.before !== payload.after) return null
  return [...changes.values()]
}

export function changedWebhookPaths(payload: unknown) {
  const data = record(payload)
  const commits = Array.isArray(data?.commits) ? data.commits : []
  return [
    ...new Set(
      commits.flatMap((value) => {
        const commit = record(value)
        return ['added', 'modified', 'removed'].flatMap((key) =>
          Array.isArray(commit?.[key])
            ? commit[key].flatMap((path) =>
                typeof path === 'string' ? [normalizeGitPath(path)] : [],
              )
            : [],
        )
      }),
    ),
  ]
}
