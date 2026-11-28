import type { DatabaseStatement } from '#/server/db/core'
import { executeAtomic } from '#/server/db/core'
import { all, first } from '#/server/db/sql'
import { invalidateRepositoryReads } from '#/server/cache/repository-read'
import type { Database } from '#/server/db/client'
import type { cacheFileMetaTable } from '#/server/db/schema'

const USERS_PER_PAGE = 20

export async function loadAdminDashboard(
  database: Database,
  cacheDatabase: Database,
  input: { query: string; page: number; repoQuery?: string; repoPage?: number },
) {
  const userFilter = input.query
    ? ' WHERE instr(lower(name), ?) > 0 OR instr(lower(email), ?) > 0 OR instr(lower(github_username), ?) > 0'
    : ''
  const userArgs = input.query
    ? (Array(3).fill(input.query.toLowerCase()) as string[])
    : []
  const repoQuery = input.repoQuery ?? ''
  const repoPage = input.repoPage ?? 1
  const repoFilter = repoQuery
    ? " WHERE instr(lower(owner || '/' || repo), ?) > 0"
    : ''
  const repoArgs = repoQuery ? [repoQuery.toLowerCase()] : []
  const [counts, cacheCounts, users, repoCount, repositories] =
    await Promise.all([
      first<{ users: number; matching: number }>(
        database,
        `SELECT (SELECT count(*) FROM user) AS users, (SELECT count(*) FROM user${userFilter}) AS matching`,
        userArgs,
      ),
      first<{
        configurations: number
        cachedFiles: number
        cacheMetadata: number
      }>(
        cacheDatabase,
        'SELECT (SELECT count(*) FROM config) AS configurations, (SELECT count(*) FROM cache_file) AS cachedFiles, (SELECT count(*) FROM cache_file_meta) AS cacheMetadata',
        [],
      ),
      all<{
        id: string
        name: string
        email: string
        emailVerified: number
        githubUsername: string | null
        createdAt: number
        updatedAt: number
        githubLinked: number
      }>(
        database,
        `SELECT id, name, email, email_verified AS emailVerified, github_username AS githubUsername, created_at AS createdAt, updated_at AS updatedAt, EXISTS (SELECT 1 FROM account WHERE account.user_id = user.id AND account.provider_id = 'github') AS githubLinked FROM user${userFilter} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        [...userArgs, USERS_PER_PAGE, (input.page - 1) * USERS_PER_PAGE],
      ),
      first<{ count: number }>(
        database,
        `SELECT count(*) AS count FROM repository${repoFilter}`,
        repoArgs,
      ),
      all<{
        source: string
        owner: string
        repo: string
        lastOpenedAt: number | null
        collaborators: number
      }>(
        database,
        `SELECT r.source, r.owner, r.repo, r.last_opened_at AS lastOpenedAt, (SELECT count(*) FROM collaborator c WHERE c.repo_id = CAST(r.external_id AS integer) AND c.owner_id = CAST(r.owner_id AS integer)) AS collaborators FROM repository r${repoFilter} ORDER BY r.last_opened_at DESC LIMIT ? OFFSET ?`,
        [...repoArgs, USERS_PER_PAGE, (repoPage - 1) * USERS_PER_PAGE],
      ),
    ])
  const matchingUsers = Number(counts?.matching ?? 0)
  const matchingRepositories = Number(repoCount?.count ?? 0)
  return {
    metrics: {
      users: Number(counts?.users ?? 0),
      configurations: Number(cacheCounts?.configurations ?? 0),
      cachedFiles: Number(cacheCounts?.cachedFiles ?? 0),
      cacheMetadata: Number(cacheCounts?.cacheMetadata ?? 0),
    },
    query: input.query,
    pageSize: USERS_PER_PAGE,
    page: input.page,
    pages: Math.max(1, Math.ceil(matchingUsers / USERS_PER_PAGE)),
    matchingUsers,
    repositories: repositories.map((repository) => ({
      ...repository,
      lastOpenedAt:
        repository.lastOpenedAt &&
        Number.isFinite(repository.lastOpenedAt) &&
        repository.lastOpenedAt > 0
          ? new Date(repository.lastOpenedAt).toISOString()
          : null,
    })),
    matchingRepositories,
    repoQuery,
    repoPage,
    repoPages: Math.max(1, Math.ceil(matchingRepositories / USERS_PER_PAGE)),
    users: users.map((user) => ({
      ...user,
      emailVerified: Boolean(user.emailVerified),
      githubLinked: Boolean(user.githubLinked),
      createdAt: new Date(user.createdAt).toISOString(),
      updatedAt: new Date(user.updatedAt).toISOString(),
    })),
  }
}

export async function revokeUserSessions(
  database: Database,
  userId: string,
  credentials: readonly DatabaseStatement[] = [],
) {
  await executeAtomic(database, [
    ...credentials,
    { sql: 'DELETE FROM session WHERE user_id = ?', args: [userId] },
  ])
}

export async function revokeAllSessions(
  database: Database,
  credentials: readonly DatabaseStatement[] = [],
) {
  await executeAtomic(database, [
    ...credentials,
    { sql: 'DELETE FROM session' },
  ])
}

export async function resetGlobalCache(
  database: Database,
  target: 'all' | 'content' | 'configuration' = 'all',
) {
  const directories =
    target === 'all' || target === 'content'
      ? await all<
          Pick<
            typeof cacheFileMetaTable.$inferSelect,
            'owner' | 'repo' | 'branch' | 'source'
          >
        >(
          database,
          'SELECT DISTINCT owner, repo, branch, source FROM cache_file_meta',
          [],
        )
      : []
  await executeAtomic(database, [
    ...(target === 'all' || target === 'content'
      ? [
          { sql: 'DELETE FROM cache_file' },
          { sql: 'DELETE FROM cache_file_meta' },
        ]
      : []),
    ...(target === 'all' || target === 'configuration'
      ? [{ sql: 'DELETE FROM config' }]
      : []),
  ])
  for (const directory of directories)
    invalidateRepositoryReads(directory.owner, directory.repo, directory.source)
}
