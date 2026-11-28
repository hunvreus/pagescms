import { invalidateRepositoryReads } from '#/server/cache/repository-read'
import { all, repositoryAddressQuery } from '#/server/db/sql'

import type { Database } from '#/server/db/client'
import type {
  RepositoryApi,
  RepositoryDirectoryEntry,
} from '#/server/repository/provider'
import { executeAtomic } from '#/server/db/core'
import { staleDirectoryCache } from '#/server/cache/directory'
import {
  affectsDirectory,
  buildCachePublication,
  executeCachePublications,
  parentDirectory,
  staleSnapshotStatement,
} from '#/server/cache/directory-store'
import { logServerEvent, serverErrorDetails } from '#/server/http'
import { repositorySource } from '#/server/repository/provider'

export type RepositoryChange = {
  path: string
  removed: boolean
  sourcePath?: string
  sha?: string
  commitSha?: string
  commitTimestamp?: string
}
export type RepositoryPush = {
  repositoryId?: number
  owner: string
  repo: string
  branch: string
  before: string
  after: string
  changes: RepositoryChange[]
  commitTimestamp?: string
}

type LazyRepositoryApi = Pick<RepositoryApi, 'source'> & {
  getApi: () => Promise<RepositoryApi>
}

export async function updateRepositoryCacheAfterMutation(
  database: Database,
  api: RepositoryApi,
  owner: string,
  repo: string,
  branch: string,
  result: {
    commitSha: string
    parentCommitSha?: string
    commitTimestamp?: string
  },
  changes: RepositoryChange[],
  knownFiles?: RepositoryDirectoryEntry[],
  repositoryId?: number,
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
        repositoryId,
      )
      return
    }
    const applied = await applyRepositoryPush(
      database,
      api,
      {
        repositoryId,
        owner,
        repo,
        branch,
        before: result.parentCommitSha,
        after: result.commitSha,
        changes: changes.map((change) => ({
          ...change,
          ...(result.commitTimestamp
            ? {
                commitSha: result.commitSha,
                commitTimestamp: result.commitTimestamp,
              }
            : {}),
        })),
        commitTimestamp: result.commitTimestamp,
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
        repositoryId,
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
        repositoryId,
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
  provider: RepositoryApi | LazyRepositoryApi,
  input: RepositoryPush,
  knownFiles?: RepositoryDirectoryEntry[],
) {
  const source = repositorySource(provider)
  invalidateRepositoryReads(input.owner, input.repo, source)
  const identity =
    input.repositoryId === undefined
      ? repositoryAddressQuery(source, input.owner, input.repo).sql
      : '?'
  const identityArgs =
    input.repositoryId === undefined
      ? repositoryAddressQuery(source, input.owner, input.repo).args
      : [input.repositoryId]
  const args = [source, ...identityArgs, input.branch]
  const snapshots = (
    await all<{
      id: number
      repositoryId: number
      source: string
      owner: string
      repo: string
      branch: string
      path: string
      context: string
      status: string
      commitSha: string | null
      updatedAt: number
    }>(
      database,
      `SELECT id, repository_id AS repositoryId, source, owner, repo, branch, path, context, status, commit_sha AS commitSha, updated_at AS updatedAt FROM cache_file_meta WHERE source = ? AND repository_id = ${identity} AND branch = ?`,
      args,
    )
  ).map((row) => ({ ...row, updatedAt: new Date(row.updatedAt) }))
  // Empty caches and already-applied pushes need neither credentials nor GitHub reads.
  if (
    snapshots.every(
      (scope) => scope.status === 'ok' && scope.commitSha === input.after,
    )
  )
    return true
  const api = 'getApi' in provider ? await provider.getApi() : provider
  // An old delivery must never roll a cache back after a newer push (including force pushes).
  if (
    (await api.getRefSha(input.owner, input.repo, input.branch)) !== input.after
  )
    return false
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
      const rows = await all<{
        path: string
        sha: string | null
        context: string
        parentPath: string
        content: string | null
        size: number | null
      }>(
        database,
        `SELECT path, sha, context, parent_path AS parentPath, content, size FROM cache_file WHERE source = ? AND repository_id = ${identity} AND branch = ? AND path IN (SELECT value FROM json_each(?))`,
        [...args, JSON.stringify(moved.map((change) => change.sourcePath!))],
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
        staleStatements.push(staleSnapshotStatement(scope, now))
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
        staleStatements.push(staleSnapshotStatement(scope, now))
        continue
      }
      publications.push(
        await buildCachePublication(database, {
          scope,
          snapshot: scope,
          entries: affected
            .filter((change) => !change.removed)
            .map((change) => ({
              ...files.get(change.path)!,
              ...(change.commitTimestamp && change.commitSha
                ? {
                    commitTimestamp: change.commitTimestamp,
                    commitSha: change.commitSha,
                  }
                : {}),
            })),
          removed: affected
            .filter((change) => change.removed)
            .map((change) => change.path),
          revision: input.after,
          commitTimestamp: input.commitTimestamp,
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
      input.repositoryId,
    )
    throw error
  }
}
