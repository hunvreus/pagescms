import { and, eq, inArray, sql } from 'drizzle-orm'

import type { Database } from './database/client.server'
import type { GitHubDirectoryEntry } from './github-api.server'
import { cacheFileMetaTable, cacheFileTable } from './database/schema'

export type CacheScope = {
  owner: string
  repo: string
  branch: string
  path: string
  context: string
}
export type CacheTransaction = Parameters<
  Parameters<Database['transaction']>[0]
>[0]

export function cacheBranch(
  input: Pick<CacheScope, 'owner' | 'repo' | 'branch'>,
) {
  return and(
    eq(cacheFileMetaTable.owner, input.owner.toLowerCase()),
    eq(cacheFileMetaTable.repo, input.repo.toLowerCase()),
    eq(cacheFileMetaTable.branch, input.branch),
  )
}

export function cacheScope(input: CacheScope) {
  return and(
    cacheBranch(input),
    eq(cacheFileMetaTable.path, input.path),
    eq(cacheFileMetaTable.context, input.context),
  )
}

export function cacheRows(input: CacheScope) {
  return and(
    eq(cacheFileTable.owner, input.owner.toLowerCase()),
    eq(cacheFileTable.repo, input.repo.toLowerCase()),
    eq(cacheFileTable.branch, input.branch),
    eq(cacheFileTable.parentPath, input.path),
    eq(cacheFileTable.context, input.context),
  )
}

// Serialize cache publication across processes, without holding a transaction during content downloads.
export function withCacheLock<T>(
  database: Database,
  input: Pick<CacheScope, 'owner' | 'repo' | 'branch'>,
  work: (transaction: CacheTransaction) => Promise<T>,
) {
  return database.transaction(async (transaction) => {
    const key = JSON.stringify([
      input.owner.toLowerCase(),
      input.repo.toLowerCase(),
      input.branch,
    ])
    await transaction.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`,
    )
    return work(transaction)
  })
}

// A monotonic timestamp is the publication token even when two changes occur in the same millisecond.
export const nextCacheVersion = sql`greatest(clock_timestamp(), ${cacheFileMetaTable.updatedAt} + interval '1 millisecond')`

export function parentDirectory(path: string) {
  const separator = path.lastIndexOf('/')
  return separator < 0 ? '' : path.slice(0, separator)
}

export function affectsDirectory(directory: string, paths: string[]) {
  return paths.some(
    (path) =>
      directory === '' ||
      path === directory ||
      path.startsWith(`${directory}/`) ||
      directory.startsWith(`${path}/`),
  )
}

export async function markCacheStale(
  transaction: CacheTransaction,
  scope: CacheScope,
) {
  await transaction
    .update(cacheFileMetaTable)
    .set({ status: 'stale', updatedAt: nextCacheVersion })
    .where(cacheScope(scope))
}

export async function writeCacheEntries(
  transaction: CacheTransaction,
  scope: CacheScope,
  entries: GitHubDirectoryEntry[],
  removed: string[],
  revision: string,
  now: Date,
) {
  // Avoid rewriting unchanged rows, including their IDs and timestamps.
  const byPath = new Map<string, typeof cacheFileTable.$inferSelect>()
  for (let offset = 0; offset < entries.length; offset += 500) {
    const existing = await transaction
      .select()
      .from(cacheFileTable)
      .where(
        and(
          cacheRows(scope),
          inArray(
            cacheFileTable.path,
            entries.slice(offset, offset + 500).map((entry) => entry.path),
          ),
        ),
      )
    for (const row of existing) byPath.set(row.path, row)
  }
  const changed = entries.filter((entry) => {
    const previous = byPath.get(entry.path)
    const content = scope.context === 'media' ? null : entry.content
    return (
      !previous ||
      previous.sha !== entry.sha ||
      previous.type !== entry.type ||
      previous.size !== entry.size ||
      previous.content !== content
    )
  })
  for (let offset = 0; offset < removed.length; offset += 200) {
    await transaction
      .delete(cacheFileTable)
      .where(
        and(
          cacheRows(scope),
          inArray(cacheFileTable.path, removed.slice(offset, offset + 200)),
        ),
      )
  }
  for (let offset = 0; offset < changed.length; offset += 50) {
    await transaction
      .insert(cacheFileTable)
      .values(
        changed.slice(offset, offset + 50).map((entry) => ({
          owner: scope.owner.toLowerCase(),
          repo: scope.repo.toLowerCase(),
          branch: scope.branch,
          context: scope.context,
          parentPath: scope.path,
          path: entry.path,
          name: entry.name,
          type: entry.type,
          content: scope.context === 'media' ? null : entry.content,
          sha: entry.sha,
          size: entry.size,
          commitSha: revision,
          updatedAt: now,
        })),
      )
      .onConflictDoUpdate({
        target: [
          cacheFileTable.owner,
          cacheFileTable.repo,
          cacheFileTable.branch,
          cacheFileTable.path,
          cacheFileTable.context,
        ],
        set: {
          name: sql`excluded.name`,
          type: sql`excluded.type`,
          content: sql`excluded.content`,
          sha: sql`excluded.sha`,
          size: sql`excluded.size`,
          commitSha: sql`excluded.commit_sha`,
          updatedAt: sql`excluded.updated_at`,
        },
      })
  }
}
