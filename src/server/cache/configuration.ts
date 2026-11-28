import { decodeBase64Utf8 } from '#/lib/base64'
import {
  ensureRepositoryIdentity,
  findRepositoryIdentityByExternalId,
} from '#/server/access/repository-identity'

import {
  CONFIGURATION_VERSION,
  normalizeConfiguration,
} from '#/shared/configuration'
import { validateConfigurationSource } from '#/shared/configuration-source'
import type { ZodType } from 'zod'
import { freezeJson, toJsonObject } from '#/shared/json'

import type { JsonObject } from '#/shared/json'

import {
  DEFAULT_REPOSITORY_SOURCE,
  isRepositoryProviderError,
  repositorySource,
} from '#/server/repository/provider'

import type { Database } from '#/server/db/client'
import { first, repositoryAddressQuery } from '#/server/db/sql'
import type { RepositoryApi } from '#/server/repository/provider'
import type { Clock } from '#/server/runtime/runtime-ports'

import { systemClock } from '#/server/runtime/runtime-ports'
import { cachePolicy } from '#/server/cache/policy'
import { logServerEvent, serverErrorDetails } from '#/server/http'

export interface StoredConfiguration {
  repositoryId: number
  source: string
  owner: string
  repo: string
  branch: string
  sha: string
  version: string
  object: JsonObject
  lastCheckedAt: Date
}

export type ConfigurationRow = Omit<
  StoredConfiguration,
  'object' | 'lastCheckedAt'
> & {
  object: string
  lastCheckedAt: number
}
type ConfigurationScope = {
  id: number
  externalId: string
  source: string
  configuration?: { branch: string; row: ConfigurationRow | null }
}

export function admittedConfigurationScope(identity?: {
  cacheId: number
  externalId: string
  source: string
  configuration?: { branch: string; row: ConfigurationRow | null }
}) {
  return (
    identity && {
      id: identity.cacheId,
      externalId: identity.externalId,
      source: identity.source,
      ...(identity.configuration?.row?.version === CONFIGURATION_VERSION && {
        configuration: identity.configuration,
      }),
    }
  )
}

export class InvalidConfigurationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidConfigurationError'
  }
}

export function parseConfigurationFile(
  encodedContent: string,
  schema?: ZodType,
) {
  const source = decodeBase64Utf8(encodedContent)
  const parsed = validateConfigurationSource(source, schema)
  const error = parsed.diagnostics.find(
    (diagnostic) => diagnostic.severity === 'error',
  )
  if (error) throw new InvalidConfigurationError(error.message)
  try {
    return toJsonObject(normalizeConfiguration(parsed.configuration))
  } catch (cause) {
    throw new InvalidConfigurationError(
      cause instanceof Error ? cause.message : 'Invalid configuration',
    )
  }
}

const parsedConfigurations = new Map<
  string,
  { object: JsonObject; size: number }
>()
let parsedConfigurationCharacters = 0
const MAX_CONFIGURATION_CHARACTERS = 2_000_000

function parseStoredConfiguration(row: ConfigurationRow): JsonObject {
  const key = JSON.stringify([
    row.source,
    row.repositoryId,
    row.branch,
    row.sha,
    row.version,
  ])
  const cached = parsedConfigurations.get(key)
  if (cached) return cached.object
  const value = row.object
  const parsed: unknown = JSON.parse(value)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
    throw new Error('Expected a JSON object')
  const object = freezeJson(parsed as JsonObject)
  if (value.length <= MAX_CONFIGURATION_CHARACTERS) {
    while (
      parsedConfigurations.size >= 16 ||
      parsedConfigurationCharacters + value.length >
        MAX_CONFIGURATION_CHARACTERS
    ) {
      const oldest = parsedConfigurations.keys().next().value!
      parsedConfigurationCharacters -= parsedConfigurations.get(oldest)!.size
      parsedConfigurations.delete(oldest)
    }
    parsedConfigurations.set(key, { object, size: value.length })
    parsedConfigurationCharacters += value.length
  }
  return object
}

function rowToConfiguration(row: ConfigurationRow): StoredConfiguration {
  const object = parseStoredConfiguration(row)
  return {
    repositoryId: row.repositoryId,
    source: row.source,
    owner: row.owner,
    repo: row.repo,
    branch: row.branch,
    sha: row.sha,
    version: row.version,
    object,
    lastCheckedAt: new Date(row.lastCheckedAt),
  }
}

export function createConfigurationStore({
  database,
  clock = systemClock,
  waitUntil,
  readFile = (api, owner, repo, branch) =>
    api.getFile(owner, repo, '.pages.yml', branch),
}: {
  database: Database
  clock?: Clock
  waitUntil?: (promise: Promise<unknown>) => void
  readFile?: (
    api: RepositoryApi,
    owner: string,
    repo: string,
    branch: string,
  ) => ReturnType<RepositoryApi['getFile']>
}) {
  async function identityFor(
    api: RepositoryApi,
    owner: string,
    repo: string,
    externalId?: string,
    admittedScope?: ConfigurationScope,
  ) {
    const source = repositorySource(api)
    if (
      admittedScope &&
      (externalId !== admittedScope.externalId ||
        source !== admittedScope.source)
    )
      throw new Error(
        'The repository identity changed. Reload before continuing.',
      )
    const identity =
      admittedScope ??
      (externalId === undefined
        ? await ensureRepositoryIdentity(database, { owner, repo, source })
        : await findRepositoryIdentityByExternalId(
            database,
            externalId,
            source,
          ))
    if (!identity)
      throw new Error(
        'The repository identity changed. Reload before continuing.',
      )
    return identity
  }

  async function find(
    owner: string,
    repo: string,
    branch: string,
    source = DEFAULT_REPOSITORY_SOURCE,
    repositoryId?: number,
  ) {
    const row = await first<{
      repositoryId: number
      source: string
      owner: string
      repo: string
      branch: string
      sha: string
      version: string
      object: string
      lastCheckedAt: number
    }>(
      database,
      `
      SELECT repository_id AS repositoryId, source, owner, repo, branch, sha,
        version, object, last_checked_at AS lastCheckedAt
      FROM config
      WHERE source = ? AND repository_id = COALESCE(?, (
        SELECT repository_id FROM repository_address WHERE source = ? AND owner = ? AND repo = ?
      )) AND branch = ?
      LIMIT 1
    `,
      [
        source,
        repositoryId ?? null,
        source,
        owner.toLowerCase(),
        repo.toLowerCase(),
        branch,
      ],
    )
    return row ? rowToConfiguration(row) : null
  }

  async function remove(
    owner: string,
    repo: string,
    branch: string,
    source = DEFAULT_REPOSITORY_SOURCE,
    repositoryId?: number,
    expected?: StoredConfiguration,
  ) {
    await first(
      database,
      `DELETE FROM config WHERE source = ? AND repository_id = COALESCE(?, ${repositoryAddressQuery(source, owner, repo).sql}) AND branch = ?${expected ? ' AND sha = ? AND version = ? AND last_checked_at = ?' : ''} RETURNING repository_id`,
      [
        source,
        repositoryId ?? null,
        ...repositoryAddressQuery(source, owner, repo).args,
        branch,
        ...(expected
          ? [expected.sha, expected.version, expected.lastCheckedAt.getTime()]
          : []),
      ],
    )
  }

  async function refresh(
    api: RepositoryApi,
    owner: string,
    repo: string,
    branch: string,
    cached: StoredConfiguration | null,
    repositoryId: number,
    removeOnError = false,
  ): Promise<StoredConfiguration | null> {
    const source = repositorySource(api)
    // Only publish against the snapshot this request observed. A local save or
    // newer refresh may finish while GitHub is responding.
    const snapshot =
      'source = ? AND repository_id = ? AND branch = ? AND sha = ? AND last_checked_at = ? AND version = ?'
    const snapshotArgs = cached
      ? [
          source,
          repositoryId,
          branch,
          cached.sha,
          cached.lastCheckedAt.getTime(),
          cached.version,
        ]
      : []
    async function removeSnapshot() {
      return cached
        ? first(
            database,
            `DELETE FROM config WHERE ${snapshot} RETURNING repository_id`,
            snapshotArgs,
          )
        : undefined
    }
    let file
    try {
      file = await readFile(api, owner, repo, branch)
    } catch (error) {
      if (isRepositoryProviderError(error, 404)) {
        if (cached) await removeSnapshot()
        return find(owner, repo, branch, source, repositoryId)
      }
      if (removeOnError) await removeSnapshot()
      throw error
    }

    const checkedAt = clock.now()
    let object: JsonObject
    try {
      object =
        cached?.version === CONFIGURATION_VERSION && cached.sha === file.sha
          ? cached.object
          : parseConfigurationFile(file.content)
    } catch (error) {
      if (removeOnError) await removeSnapshot()
      throw error
    }
    const serialized = JSON.stringify(object)
    if (cached) {
      await first(
        database,
        `UPDATE config SET sha = ?, version = ?, object = ?, last_checked_at = ? WHERE ${snapshot} RETURNING repository_id`,
        [
          file.sha,
          CONFIGURATION_VERSION,
          serialized,
          checkedAt.getTime(),
          ...snapshotArgs,
        ],
      )
    } else {
      await first(
        database,
        'INSERT INTO config (repository_id, source, owner, repo, branch, sha, version, object, last_checked_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING RETURNING repository_id',
        [
          repositoryId,
          source,
          owner.toLowerCase(),
          repo.toLowerCase(),
          branch,
          file.sha,
          CONFIGURATION_VERSION,
          serialized,
          checkedAt.getTime(),
        ],
      )
    }
    return find(owner, repo, branch, source, repositoryId)
  }

  async function save(
    owner: string,
    repo: string,
    branch: string,
    sha: string,
    object: JsonObject,
    source = DEFAULT_REPOSITORY_SOURCE,
    repositoryId?: number,
  ): Promise<StoredConfiguration> {
    const id =
      repositoryId ??
      (await ensureRepositoryIdentity(database, { source, owner, repo })).id
    const checkedAt = clock.now()
    const normalizedOwner = owner.toLowerCase()
    const normalizedRepo = repo.toLowerCase()
    await first(
      database,
      `INSERT INTO config (repository_id, source, owner, repo, branch, sha, version, object, last_checked_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (repository_id, branch) DO UPDATE SET sha = excluded.sha, version = excluded.version, object = excluded.object, last_checked_at = excluded.last_checked_at RETURNING repository_id`,
      [
        id,
        source,
        normalizedOwner,
        normalizedRepo,
        branch,
        sha,
        CONFIGURATION_VERSION,
        JSON.stringify(object),
        checkedAt.getTime(),
      ],
    )
    return {
      repositoryId: id,
      source,
      owner: normalizedOwner,
      repo: normalizedRepo,
      branch,
      sha,
      version: CONFIGURATION_VERSION,
      object: freezeJson(object),
      lastCheckedAt: checkedAt,
    }
  }

  return {
    async get(
      api: RepositoryApi,
      owner: string,
      repo: string,
      branch: string,
      externalId?: string,
      admittedScope?: ConfigurationScope,
    ): Promise<StoredConfiguration | null> {
      const source = repositorySource(api)
      const identity = await identityFor(
        api,
        owner,
        repo,
        externalId,
        admittedScope,
      )
      const prefetched = admittedScope?.configuration
      const cached =
        prefetched?.branch === branch
          ? prefetched.row && rowToConfiguration(prefetched.row)
          : await find(owner, repo, branch, source, identity.id)
      if (cached?.version === CONFIGURATION_VERSION) {
        if (
          waitUntil &&
          clock.now().getTime() - cached.lastCheckedAt.getTime() >
            cachePolicy(database).configCheckMs
        ) {
          waitUntil(
            refresh(api, owner, repo, branch, cached, identity.id).catch(
              (error: unknown) => {
                logServerEvent('error', {
                  event: 'configuration_background_refresh_failed',
                  owner,
                  repo,
                  branch,
                  ...serverErrorDetails(error),
                })
              },
            ),
          )
        }
        return cached
      }
      return refresh(api, owner, repo, branch, cached, identity.id)
    },
    async refresh(
      api: RepositoryApi,
      owner: string,
      repo: string,
      branch: string,
      externalId?: string,
      admittedScope?: ConfigurationScope,
      options?: {
        removeOnError?: boolean
        cached?: StoredConfiguration | null
      },
    ) {
      const source = repositorySource(api)
      const identity = await identityFor(
        api,
        owner,
        repo,
        externalId,
        admittedScope,
      )
      return refresh(
        api,
        owner,
        repo,
        branch,
        options && 'cached' in options
          ? (options.cached ?? null)
          : await find(owner, repo, branch, source, identity.id),
        identity.id,
        options?.removeOnError,
      )
    },
    find,
    remove,
    save,
  }
}

export type ConfigurationStore = ReturnType<typeof createConfigurationStore>
