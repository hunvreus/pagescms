import { and, eq, inArray } from 'drizzle-orm'

import type { Database } from './database/client.server'
import type {
  RepositoryApi,
  RepositoryDirectoryEntry,
} from './repository-provider.server'
import { executeAtomic } from './database/core.server'
import { cacheFileMetaTable, cacheFileTable } from './database/schema'
import {
  invalidateEphemeralMediaDirectories,
  staleDirectoryCache,
} from './directory-cache.server'
import {
  affectsDirectory,
  buildCachePublication,
  cacheBranch,
  executeCachePublications,
  parentDirectory,
  staleSnapshotStatement,
} from './directory-cache-store.server'
import { logServerEvent, serverErrorDetails } from './http'
import { repositorySource } from './repository-provider.server'

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
  api: RepositoryApi,
  owner: string,
  repo: string,
  branch: string,
  result: { commitSha: string; parentCommitSha?: string },
  changes: RepositoryChange[],
  knownFiles?: RepositoryDirectoryEntry[],
) {
  const source = repositorySource(api)
  try {
    if (!result.parentCommitSha) {
      await staleDirectoryCache(
        database,
        owner,
        repo,
        branch,
        changes.map((change) => change.path),
        undefined,
        source,
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
        undefined,
        source,
      )
  } catch (error) {
    // GitHub already accepted the write. A cache error must not turn success into a retryable save failure.
    logServerEvent('error', {
      event: 'repository_cache_update_failed',
      owner,
      repo,
      branch,
      ...serverErrorDetails(error),
    })
    try {
      await staleDirectoryCache(
        database,
        owner,
        repo,
        branch,
        undefined,
        undefined,
        source,
      )
    } catch (invalidationError) {
      logServerEvent('error', {
        event: 'repository_cache_invalidation_failed',
        owner,
        repo,
        branch,
        ...serverErrorDetails(invalidationError),
      })
    }
  }
}

export async function applyRepositoryPush(
  database: Database,
  api: RepositoryApi,
  input: RepositoryPush,
  knownFiles?: RepositoryDirectoryEntry[],
) {
  const source = repositorySource(api)
  invalidateEphemeralMediaDirectories(
    input.owner,
    input.repo,
    input.branch,
    source,
  )
  // An old delivery must never roll a cache back after a newer push (including force pushes).
  if (
    (await api.getRefSha(input.owner, input.repo, input.branch)) !== input.after
  )
    return false
  const snapshots = await database
    .select()
    .from(cacheFileMetaTable)
    .where(cacheBranch({ source, ...input }))
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
            eq(cacheFileTable.source, source),
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
    const publications = []
    const staleStatements = []
    const now = new Date()
    for (const scope of snapshots) {
      if (scope.status === 'ok' && scope.commitSha === input.after) continue
      if (scope.status !== 'ok' || scope.commitSha !== input.before) {
        staleStatements.push(
          staleSnapshotStatement(database, scope, scope, now),
        )
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
        staleStatements.push(
          staleSnapshotStatement(database, scope, scope, now),
        )
        continue
      }
      publications.push(
        await buildCachePublication(database, {
          scope,
          snapshot: scope,
          entries: affected
            .filter((change) => !change.removed)
            .map((change) => files.get(change.path)!),
          removed: affected
            .filter((change) => change.removed)
            .map((change) => change.path),
          revision: input.after,
          now,
          unchanged: affected.length === 0,
        }),
      )
    }
    await executeCachePublications(database, publications)
    for (let offset = 0; offset < staleStatements.length; offset += 100) {
      await executeAtomic(database, staleStatements.slice(offset, offset + 100))
    }
    return true
  } catch (error) {
    // Keep the old data, but make it ineligible until a complete revision can be read.
    await staleDirectoryCache(
      database,
      input.owner,
      input.repo,
      input.branch,
      undefined,
      undefined,
      source,
    )
    throw error
  }
}
