import { configurationStoreFor } from '#/server/cache/configuration-access'
import { UserError } from '#/server/http'
import { requireRepositoryManager } from '#/server/access/repository-policy'
import { findRepositoryIdentityByExternalId } from '#/server/access/repository-identity'
import { isCacheManagementEnabled } from '#/shared/configuration'
import { all, first } from '#/server/db/sql'

import { admittedConfigurationScope } from '#/server/cache/configuration'
import { DEFAULT_REPOSITORY_SOURCE } from '#/server/repository/provider'
import { invalidateDirectoryCache } from '#/server/cache/directory'

import type { Database } from '#/server/db/client'
import type { RepositoryUser } from '#/server/repository/repositories'
import type { RepositoryAccessService } from '#/server/access/repository'

type CacheInput = {
  database: Database
  repositoryAccess: RepositoryAccessService
  user: RepositoryUser
  owner: string
  repo: string
  branch: string
  repoId?: string
}

async function cacheContext(input: CacheInput, requireOptIn = true) {
  if (!input.user.githubUsername) {
    throw new UserError('Only GitHub users can manage the cache')
  }
  const {
    api,
    repository,
    identity: admittedIdentity,
  } = await requireRepositoryManager(input.repositoryAccess, input.user, input)
  if (admittedIdentity && admittedIdentity.externalId !== String(repository.id))
    throw new UserError(
      'The repository identity changed. Reload before continuing.',
    )
  const identity = admittedIdentity
    ? { id: admittedIdentity.cacheId }
    : await findRepositoryIdentityByExternalId(
        input.database,
        String(repository.id),
      )
  if (!identity)
    throw new UserError(
      'The repository identity changed. Reload before continuing.',
    )
  const configurationStore = configurationStoreFor(
    input.repositoryAccess,
    input.database,
  )
  if (requireOptIn) {
    const configuration = await configurationStore.get(
      api,
      input.owner,
      input.repo,
      input.branch,
      String(repository.id),
      admittedConfigurationScope(admittedIdentity),
    )
    if (!configuration || !isCacheManagementEnabled(configuration.object)) {
      throw new UserError('Cache management is disabled for this repository')
    }
  }
  return {
    configurationStore,
    repositoryId: identity.id,
  }
}

export async function loadCacheStatus(input: CacheInput) {
  const { repositoryId } = await cacheContext(input)
  const row = await first<{
    fileCount: number
    directoryCount: number
    sha: string | null
    version: string | null
    lastCheckedAt: number | null
  }>(
    input.database,
    `SELECT (SELECT count(*) FROM cache_file WHERE source = ? AND repository_id = ? AND branch = ?) AS fileCount, (SELECT count(*) FROM cache_file_meta WHERE source = ? AND repository_id = ? AND branch = ?) AS directoryCount, c.sha, c.version, c.last_checked_at AS lastCheckedAt FROM (SELECT 1) LEFT JOIN config c ON c.source = ? AND c.repository_id = ? AND c.branch = ?`,
    [
      DEFAULT_REPOSITORY_SOURCE,
      repositoryId,
      input.branch,
      DEFAULT_REPOSITORY_SOURCE,
      repositoryId,
      input.branch,
      DEFAULT_REPOSITORY_SOURCE,
      repositoryId,
      input.branch,
    ],
  )
  return {
    fileCount: Number(row?.fileCount ?? 0),
    configuration:
      row?.sha != null && row.version != null && row.lastCheckedAt != null
        ? {
            sha: row.sha,
            version: row.version,
            lastCheckedAt: new Date(row.lastCheckedAt).toISOString(),
          }
        : null,
    directoryCount: Number(row?.directoryCount ?? 0),
  }
}

export type CacheAction = 'clear-content' | 'clear-configuration' | 'clear-all'

export async function manageCache(input: CacheInput & { action: CacheAction }) {
  const { configurationStore, repositoryId } = await cacheContext(
    input,
    input.action !== 'clear-configuration',
  )
  if (input.action === 'clear-content' || input.action === 'clear-all') {
    await invalidateDirectoryCache(
      input.database,
      input.owner,
      input.repo,
      input.branch,
      DEFAULT_REPOSITORY_SOURCE,
      repositoryId,
    )
  }
  if (input.action === 'clear-configuration' || input.action === 'clear-all') {
    await configurationStore.remove(
      input.owner,
      input.repo,
      input.branch,
      DEFAULT_REPOSITORY_SOURCE,
      repositoryId,
    )
  }
  const messages: Record<CacheAction, string> = {
    'clear-content': 'Content cache cleared',
    'clear-configuration': 'Configuration cache cleared',
    'clear-all': 'All repository caches cleared',
  }
  return { message: messages[input.action] }
}

export async function loadCacheFiles(
  input: CacheInput & { page: number; search?: string },
) {
  const { repositoryId } = await cacheContext(input)
  const rows = await all<{
    path: string
    context: string
    type: string
    sha: string | null
    commitSha: string | null
  }>(
    input.database,
    `SELECT path, context, type, sha, commit_sha AS commitSha FROM cache_file WHERE source = ? AND repository_id = ? AND branch = ? ${input.search ? 'AND instr(lower(path), ?) > 0' : ''} ORDER BY path ASC, id ASC LIMIT 11 OFFSET ?`,
    [
      DEFAULT_REPOSITORY_SOURCE,
      repositoryId,
      input.branch,
      ...(input.search ? [input.search.toLowerCase()] : []),
      input.page * 10,
    ],
  )
  return { files: rows.slice(0, 10), hasMore: rows.length > 10 }
}
