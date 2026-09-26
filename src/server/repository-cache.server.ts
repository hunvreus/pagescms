import { and, eq, inArray } from 'drizzle-orm'

import type { Database } from './database/client.server'
import type { GitHubApi, GitHubDirectoryEntry } from './github-api.server'
import { cacheFileMetaTable, cacheFileTable } from './database/schema'
import {
  invalidateEphemeralMediaDirectories,
  staleDirectoryCache,
} from './directory-cache.server'
import {
  affectsDirectory,
  cacheBranch,
  markCacheStale,
  nextCacheVersion,
  parentDirectory,
  withCacheLock,
  writeCacheEntries,
} from './directory-cache-store.server'

export type RepositoryChange = {
  path: string
  removed: boolean
  sourcePath?: string
  sha?: string
}
export type RepositoryPush = {
  owner: string
  repo: string
  branch: string
  before: string
  after: string
  changes: RepositoryChange[]
}

export async function updateRepositoryCacheAfterMutation(
  database: Database,
  api: GitHubApi,
  owner: string,
  repo: string,
  branch: string,
  result: { commitSha: string; parentCommitSha?: string },
  changes: RepositoryChange[],
  knownFiles?: GitHubDirectoryEntry[],
) {
  try {
    if (!result.parentCommitSha) {
      await staleDirectoryCache(
        database,
        owner,
        repo,
        branch,
        changes.map((change) => change.path),
      )
      return
    }
    const applied = await applyRepositoryPush(
      database,
      api,
      {
        owner,
        repo,
        branch,
        before: result.parentCommitSha,
        after: result.commitSha,
        changes,
      },
      knownFiles,
    )
    if (!applied)
      await staleDirectoryCache(
        database,
        owner,
        repo,
        branch,
        changes.map((change) => change.path),
      )
  } catch (error) {
    // GitHub already accepted the write. A cache error must not turn success into a retryable save failure.
    console.error('Could not update repository cache after mutation', error)
    try {
      await staleDirectoryCache(database, owner, repo, branch)
    } catch (invalidationError) {
      console.error('Could not mark repository cache stale', invalidationError)
    }
  }
}

export async function applyRepositoryPush(
  database: Database,
  api: GitHubApi,
  input: RepositoryPush,
  knownFiles?: GitHubDirectoryEntry[],
) {
  invalidateEphemeralMediaDirectories(input.owner, input.repo, input.branch)
  // An old delivery must never roll a cache back after a newer push (including force pushes).
  if (
    (await api.getRefSha(input.owner, input.repo, input.branch)) !== input.after
  )
    return false
  const snapshots = await database
    .select()
    .from(cacheFileMetaTable)
    .where(cacheBranch(input))
  const eligible = snapshots.filter(
    (scope) => scope.status === 'ok' && scope.commitSha === input.before,
  )
  const changed = input.changes.filter((change) => !change.removed)
  const contentPaths = new Set(
    changed
      .filter((change) =>
        eligible.some(
          (scope) =>
            scope.context === 'collection' &&
            scope.path === parentDirectory(change.path),
        ),
      )
      .map((change) => change.path),
  )
  const mediaPaths = new Set(
    changed
      .filter(
        (change) =>
          !contentPaths.has(change.path) &&
          eligible.some(
            (scope) =>
              scope.context === 'media' &&
              scope.path === parentDirectory(change.path),
          ),
      )
      .map((change) => change.path),
  )
  const files = new Map((knownFiles ?? []).map((file) => [file.path, file]))
  try {
    const moved = changed.filter((change) => change.sourcePath && change.sha)
    if (moved.length) {
      const rows = await database
        .select()
        .from(cacheFileTable)
        .where(
          and(
            eq(cacheFileTable.owner, input.owner.toLowerCase()),
            eq(cacheFileTable.repo, input.repo.toLowerCase()),
            eq(cacheFileTable.branch, input.branch),
            inArray(
              cacheFileTable.path,
              moved.map((change) => change.sourcePath!),
            ),
          ),
        )
      for (const change of moved) {
        const row = rows.find(
          (candidate) =>
            candidate.path === change.sourcePath &&
            candidate.sha === change.sha &&
            (!contentPaths.has(change.path) ||
              candidate.context === 'collection') &&
            eligible.some(
              (scope) =>
                scope.path === candidate.parentPath &&
                scope.context === candidate.context,
            ),
        )
        if (row)
          files.set(change.path, {
            path: change.path,
            name: change.path.slice(change.path.lastIndexOf('/') + 1),
            type: 'file',
            sha: row.sha,
            content: row.content,
            size: row.size,
            downloadUrl: null,
          })
      }
    }
    for (const [paths, includeContent] of [
      [contentPaths, true],
      [mediaPaths, false],
    ] as const) {
      const missing = [...paths].filter((path) => !files.has(path))
      if (!missing.length) continue
      for (const file of await api.getFiles(
        input.owner,
        input.repo,
        input.after,
        missing,
        includeContent,
      ))
        files.set(file.path, file)
    }
    if (
      (await api.getRefSha(input.owner, input.repo, input.branch)) !==
      input.after
    )
      return false
    await withCacheLock(database, input, async (transaction) => {
      const scopes = await transaction
        .select()
        .from(cacheFileMetaTable)
        .where(cacheBranch(input))
      for (const scope of scopes) {
        if (scope.status === 'ok' && scope.commitSha === input.after) continue
        const snapshot = snapshots.find((value) => value.id === scope.id)
        // A refresh or invalidation completed during the download; leave its decision intact.
        if (
          !snapshot ||
          snapshot.updatedAt.getTime() !== scope.updatedAt.getTime()
        )
          continue
        if (scope.status !== 'ok' || scope.commitSha !== input.before) {
          await markCacheStale(transaction, scope)
          continue
        }
        const affected = input.changes.filter((change) =>
          affectsDirectory(scope.path, [change.path]),
        )
        // Parent directory rows can contain node-file data; reconcile them rather than guessing.
        if (
          affected.some(
            (change) =>
              parentDirectory(change.path) !== scope.path ||
              (!change.removed && !files.has(change.path)),
          )
        ) {
          await markCacheStale(transaction, scope)
          continue
        }
        if (affected.length) {
          await writeCacheEntries(
            transaction,
            scope,
            affected
              .filter((change) => !change.removed)
              .map((change) => files.get(change.path)!),
            affected
              .filter((change) => change.removed)
              .map((change) => change.path),
            input.after,
            new Date(),
          )
        }
        await transaction
          .update(cacheFileMetaTable)
          .set({
            commitSha: input.after,
            status: 'ok',
            error: null,
            lastCheckedAt: new Date(),
            updatedAt: nextCacheVersion,
          })
          .where(eq(cacheFileMetaTable.id, scope.id))
      }
    })
    return true
  } catch (error) {
    // Keep the old data, but make it ineligible until a complete revision can be read.
    await staleDirectoryCache(database, input.owner, input.repo, input.branch)
    throw error
  }
}
