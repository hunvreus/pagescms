import { ensureRepositoryIdentity } from '#/server/access/repository-identity'

import type { Database } from '#/server/db/client'
import type { cacheFileTable } from '#/server/db/schema'
import type {
  RepositoryApi,
  RepositoryDirectoryEntry,
} from '#/server/repository/provider'
import type { Clock } from '#/server/runtime/runtime-ports'

import { systemClock } from '#/server/runtime/runtime-ports'
import { cachePolicy } from '#/server/cache/policy'
import { invalidateRepositoryReads } from '#/server/cache/repository-read'
import {
  affectsDirectory,
  parentDirectory,
  publishCacheSnapshot,
  staleSnapshotStatement,
} from '#/server/cache/directory-store'
import { executeAtomic } from '#/server/db/core'
import { all, first, repositoryAddressQuery } from '#/server/db/sql'
import { logServerEvent, serverErrorDetails } from '#/server/http'
import {
  DEFAULT_REPOSITORY_SOURCE,
  repositorySource,
} from '#/server/repository/provider'

export async function readNodeFiles(
  api: RepositoryApi,
  owner: string,
  repo: string,
  revision: string,
  paths: string[],
) {
  const unique = [...new Set(paths)]
  const sorted = [...unique].sort()
  const files = await api.getFiles(owner, repo, revision, sorted, true, true)
  const byPath = new Map(
    files
      .filter((file) => file.type === 'file')
      .map((file) => [file.path, file]),
  )
  return unique.flatMap((path) => {
    const file = byPath.get(path)
    return file ? [{ ...file }] : []
  })
}

type DirectoryContext = 'collection' | 'media'
type DirectoryResult = {
  entries: RepositoryDirectoryEntry[]
  revision?: string | null
}

export function createInFlightDeduper() {
  const pending = new Map<string, Promise<DirectoryResult>>()

  return (key: string, load: () => Promise<DirectoryResult>) => {
    const existing = pending.get(key)
    if (existing) return existing

    const request = load().finally(() => {
      if (pending.get(key) === request) pending.delete(key)
    })
    pending.set(key, request)
    return request
  }
}

export function isDirectoryCacheFresh(
  lastCheckedAt: Date | null,
  now: Date,
  ttlMs: number,
) {
  return (
    lastCheckedAt !== null && now.getTime() - lastCheckedAt.getTime() <= ttlMs
  )
}

export function createDirectoryCache({
  database,
  repositoryId,
  clock = systemClock,
  ttlMs = cachePolicy(database).checkMs,
}: {
  database: Database
  repositoryId?: number
  clock?: Clock
  ttlMs?: number
}) {
  const dedupe = createInFlightDeduper()

  function requestKey(
    mode: 'direct' | 'refresh',
    owner: string,
    repo: string,
    branch: string,
    path: string,
    context: DirectoryContext,
    nodeFilename?: string,
    source = DEFAULT_REPOSITORY_SOURCE,
  ) {
    return JSON.stringify([
      mode,
      repositoryId ?? null,
      source,
      owner.toLowerCase(),
      repo.toLowerCase(),
      branch,
      path,
      context,
      nodeFilename ?? null,
    ])
  }

  async function cachedDirectory(
    source: string,
    owner: string,
    repo: string,
    branch: string,
    path: string,
    context: DirectoryContext,
    admittedId = repositoryId,
  ) {
    type Row = {
      status: string
      commit_sha: string | null
      refreshed_at: number | null
      updated_at: number
      last_checked_at: number
      type: string | null
      name: string | null
      path: string | null
      sha: string | null
      content: string | null
      size: number | null
    }
    const identity =
      admittedId === undefined
        ? repositoryAddressQuery(source, owner, repo).sql
        : '?'
    const rows = await all<Row>(
      database,
      `
      SELECT m.status, m.commit_sha, m.refreshed_at, m.updated_at, m.last_checked_at,
        f.type, f.name, f.path, f.sha, f.content, f.size
      FROM cache_file_meta m
      LEFT JOIN cache_file f ON f.repository_id = m.repository_id AND f.source = m.source
        AND f.branch = m.branch AND f.parent_path = m.path AND f.context = m.context
      WHERE m.source = ? AND m.repository_id = ${identity} AND m.branch = ? AND m.path = ? AND m.context = ?`,
      [
        source,
        ...(admittedId === undefined
          ? repositoryAddressQuery(source, owner, repo).args
          : [admittedId]),
        branch,
        path,
        context,
      ],
    )
    const meta = rows.at(0)
    if (!meta) return null
    return {
      status: meta.status,
      revision: meta.commit_sha,
      filledAt: new Date(meta.refreshed_at ?? meta.updated_at),
      lastCheckedAt: new Date(meta.last_checked_at),
      entries: rows
        .filter((row) => row.type !== null)
        .map((row): RepositoryDirectoryEntry => ({
          type: row.type === 'dir' ? 'dir' : 'file',
          name: row.name!,
          path: row.path!,
          sha: row.sha,
          content: row.content,
          size: row.size,
          downloadUrl: null,
        })),
    }
  }

  async function refresh(
    api: RepositoryApi,
    owner: string,
    repo: string,
    branch: string,
    path: string,
    context: DirectoryContext,
    nodeFilename?: string,
  ) {
    const source = repositorySource(api)
    const id =
      repositoryId ??
      (await ensureRepositoryIdentity(database, { source, owner, repo })).id
    const scope = {
      repositoryId: id,
      source,
      owner: owner.toLowerCase(),
      repo: repo.toLowerCase(),
      branch,
      path,
      context,
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      await executeAtomic(database, [
        {
          sql: `INSERT INTO cache_file_meta (repository_id, source, owner, repo, branch, path, context, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'stale') ON CONFLICT DO NOTHING`,
          args: [id, source, scope.owner, scope.repo, branch, path, context],
        },
      ])
      const stored = await first<{
        id: number
        status: string
        commitSha: string | null
        refreshedAt: number | null
        updatedAt: number
      }>(
        database,
        `SELECT id, status, commit_sha AS commitSha, refreshed_at AS refreshedAt,
          updated_at AS updatedAt FROM cache_file_meta
        WHERE repository_id = ? AND source = ? AND branch = ? AND path = ? AND context = ?`,
        [id, source, branch, path, context],
      )
      if (!stored) continue
      const snapshot = {
        ...stored,
        refreshedAt:
          stored.refreshedAt === null ? null : new Date(stored.refreshedAt),
        updatedAt: new Date(stored.updatedAt),
      }
      try {
        const fetched =
          context === 'collection' && api.getDirectorySnapshot
            ? await api.getDirectorySnapshot(owner, repo, branch, path)
            : undefined
        // Another worker can invalidate this snapshot while our local branch head is still cached.
        const revision = fetched
          ? fetched.revision
          : await api.getRefSha(owner, repo, branch)
        if (fetched?.missing) {
          const version = [snapshot.id, stored.updatedAt]
          const [, deleted] = await executeAtomic(database, [
            {
              sql: `DELETE FROM cache_file WHERE repository_id = ? AND source = ? AND branch = ?
                AND parent_path = ? AND context = ? AND EXISTS (
                  SELECT 1 FROM cache_file_meta WHERE id = ? AND updated_at = ?
                )`,
              args: [id, source, branch, path, context, ...version],
            },
            {
              sql: 'DELETE FROM cache_file_meta WHERE id = ? AND updated_at = ?',
              args: version,
            },
          ])
          if (!deleted.rowsAffected) {
            const current = await cachedDirectory(
              source,
              owner,
              repo,
              branch,
              path,
              context,
              id,
            )
            if (current?.status === 'ok')
              return { entries: current.entries, revision: current.revision }
            continue
          }
          return { entries: [], revision }
        }
        const filledAt = snapshot.refreshedAt ?? snapshot.updatedAt
        const unchanged =
          snapshot.status === 'ok' &&
          snapshot.commitSha === revision &&
          (cachePolicy(database).fileMs === -1 ||
            clock.now().getTime() - filledAt.getTime() <=
              cachePolicy(database).fileMs)
        const entries = unchanged
          ? ((await cachedDirectory(source, owner, repo, branch, path, context))
              ?.entries ?? [])
          : fetched
            ? fetched.entries
            : context === 'media'
              ? await api.getMediaDirectory(owner, repo, revision, path)
              : await api.getDirectory(owner, repo, revision, path)
        const existing = unchanged
          ? []
          : await all<Pick<typeof cacheFileTable.$inferSelect, 'path'>>(
              database,
              `SELECT path FROM cache_file WHERE source = ? AND repository_id = ?
                AND branch = ? AND parent_path = ? AND context = ?`,
              [source, id, branch, path, context],
            )
        const present = new Set(entries.map((entry) => entry.path))
        const published = await publishCacheSnapshot(database, {
          scope,
          snapshot,
          entries,
          removed: existing
            .filter((entry) => !present.has(entry.path))
            .map((entry) => entry.path),
          revision,
          now: clock.now(),
          unchanged,
        })
        if (published) {
          return { entries, revision }
        }
      } catch (error) {
        // A failed old refresh must not overwrite a newer successful publication.
        await executeAtomic(database, [
          {
            sql: `UPDATE cache_file_meta SET status = 'error', error = ?, updated_at = ?
              WHERE id = ? AND updated_at = ?`,
            args: [
              'Directory refresh failed. Retry to update the cache.',
              Math.max(clock.now().getTime(), snapshot.updatedAt.getTime() + 1),
              snapshot.id,
              snapshot.updatedAt.getTime(),
            ],
          },
        ]).catch(() => {})
        throw error
      }
    }
    // A busy branch can keep changing while we fetch. Return a fresh direct read without publishing it.
    return loadDirect(api, owner, repo, branch, path, context, nodeFilename)
  }

  function dedupedRefresh(
    api: RepositoryApi,
    owner: string,
    repo: string,
    branch: string,
    path: string,
    context: DirectoryContext,
    nodeFilename?: string,
  ) {
    const source = repositorySource(api)
    return dedupe(
      requestKey(
        'refresh',
        owner,
        repo,
        branch,
        path,
        context,
        nodeFilename,
        source,
      ),
      () => refresh(api, owner, repo, branch, path, context, nodeFilename),
    )
  }

  async function loadDirect(
    api: RepositoryApi,
    owner: string,
    repo: string,
    branch: string,
    path: string,
    context: DirectoryContext,
    nodeFilename?: string,
  ) {
    const source = repositorySource(api)
    if (context === 'media')
      return { entries: await api.getMediaDirectory(owner, repo, branch, path) }
    return dedupe(
      requestKey(
        'direct',
        owner,
        repo,
        branch,
        path,
        context,
        nodeFilename,
        source,
      ),
      async () => ({
        entries: await api.getDirectory(
          owner,
          repo,
          branch,
          path,
          nodeFilename,
        ),
      }),
    )
  }

  const cache = {
    async get(input: {
      api: RepositoryApi
      owner: string
      repo: string
      branch: string
      path: string
      context: DirectoryContext
      enabled: boolean
      forceRefresh?: boolean
      nodeFilename?: string
    }) {
      if (input.enabled && input.forceRefresh) {
        invalidateRepositoryReads(
          input.owner,
          input.repo,
          repositorySource(input.api),
        )
        return refresh(
          input.api,
          input.owner,
          input.repo,
          input.branch,
          input.path,
          input.context,
          input.nodeFilename,
        )
      }
      if (!input.enabled) {
        return loadDirect(
          input.api,
          input.owner,
          input.repo,
          input.branch,
          input.path,
          input.context,
          input.nodeFilename,
        )
      }
      const source = repositorySource(input.api)
      const cached = await cachedDirectory(
        source,
        input.owner,
        input.repo,
        input.branch,
        input.path,
        input.context,
      )
      if (
        cached &&
        cached.status === 'ok' &&
        (cachePolicy(database).fileMs === -1 ||
          clock.now().getTime() - cached.filledAt.getTime() <=
            cachePolicy(database).fileMs) &&
        isDirectoryCacheFresh(cached.lastCheckedAt, clock.now(), ttlMs)
      ) {
        return { entries: cached.entries, revision: cached.revision }
      }
      return dedupedRefresh(
        input.api,
        input.owner,
        input.repo,
        input.branch,
        input.path,
        input.context,
        input.nodeFilename,
      )
    },
    refresh(input: {
      api: RepositoryApi
      owner: string
      repo: string
      branch: string
      path: string
      context: DirectoryContext
      nodeFilename?: string
    }) {
      invalidateRepositoryReads(
        input.owner,
        input.repo,
        repositorySource(input.api),
      )
      return dedupedRefresh(
        input.api,
        input.owner,
        input.repo,
        input.branch,
        input.path,
        input.context,
        input.nodeFilename,
      )
    },
  }
  async function getNodeFiles(
    input: Parameters<typeof cache.get>[0],
    revision: string | null | undefined,
    paths: string[],
  ) {
    const source = repositorySource(input.api)
    const nodes: RepositoryDirectoryEntry[] = []
    for (
      let offset = 0;
      input.enabled && revision && offset < paths.length;
      offset += 80
    ) {
      const batch = paths.slice(offset, offset + 80)
      const identity =
        repositoryId === undefined
          ? repositoryAddressQuery(source, input.owner, input.repo).sql
          : '?'
      const rows = await all<
        Pick<
          typeof cacheFileTable.$inferSelect,
          'path' | 'name' | 'content' | 'sha' | 'size'
        >
      >(
        database,
        `SELECT f.path, f.name, f.content, f.sha, f.size
          FROM cache_file f JOIN cache_file_meta m
            ON m.repository_id = f.repository_id AND m.source = f.source
            AND m.branch = f.branch AND m.path = f.parent_path AND m.context = f.context
          WHERE f.repository_id = ${identity} AND f.source = ? AND f.branch = ?
            AND f.context = 'collection' AND m.status = 'ok' AND m.commit_sha = ?
            AND f.path IN (SELECT value FROM json_each(?))`,
        [
          ...(repositoryId === undefined
            ? repositoryAddressQuery(source, input.owner, input.repo).args
            : [repositoryId]),
          source,
          input.branch,
          revision,
          JSON.stringify(batch),
        ],
      )
      for (const row of rows) {
        nodes.push({
          type: 'file',
          path: row.path,
          name: row.name,
          content: row.content,
          sha: row.sha,
          size: row.size,
          downloadUrl: null,
        })
      }
    }
    const found = new Set(nodes.map((node) => node.path))
    const missing = paths.filter((path) => !found.has(path))
    if (missing.length)
      nodes.push(
        ...(await readNodeFiles(
          input.api,
          input.owner,
          input.repo,
          revision ?? input.branch,
          missing,
        )),
      )
    return nodes
  }
  return {
    ...cache,
    getNodeFiles,
    async get(
      input: Parameters<typeof cache.get>[0],
    ): Promise<DirectoryResult> {
      const result = await cache.get(input)
      if (!input.enabled || input.context !== 'collection') return result
      // Node files are configuration-dependent enrichment, not members of the
      // parent directory. Reuse verified child snapshots, then batch only misses.
      const entries = result.entries.filter(
        (entry) => parentDirectory(entry.path) === input.path,
      )
      if (!input.nodeFilename) return { ...result, entries }
      const paths = entries
        .filter((entry) => entry.type === 'dir')
        .map((entry) => `${entry.path}/${input.nodeFilename}`)
      if (!paths.length) return { ...result, entries }
      const nodes = await getNodeFiles(input, result.revision, paths)
      return { ...result, entries: [...entries, ...nodes] }
    },
  }
}

export async function invalidateDirectoryCache(
  database: Database,
  owner: string,
  repo: string,
  branch: string,
  source = DEFAULT_REPOSITORY_SOURCE,
  repositoryId?: number,
) {
  invalidateRepositoryReads(owner, repo, source)
  const identity =
    repositoryId === undefined
      ? repositoryAddressQuery(source, owner, repo).sql
      : '?'
  const args = [
    ...(repositoryId === undefined
      ? repositoryAddressQuery(source, owner, repo).args
      : [repositoryId]),
    source,
    branch,
  ]
  await executeAtomic(database, [
    {
      sql: `DELETE FROM cache_file WHERE repository_id = ${identity} AND source = ? AND branch = ?`,
      args,
    },
    {
      sql: `DELETE FROM cache_file_meta WHERE repository_id = ${identity} AND source = ? AND branch = ?`,
      args,
    },
  ])
}

export async function invalidateDirectoryCacheAfterMutation(
  database: Database,
  owner: string,
  repo: string,
  branch: string,
  paths?: string[],
  preservedRevision?: string | null,
  source = DEFAULT_REPOSITORY_SOURCE,
  repositoryId?: number,
) {
  try {
    await staleDirectoryCache(
      database,
      owner,
      repo,
      branch,
      paths,
      preservedRevision,
      source,
      repositoryId,
    )
  } catch (error) {
    // The GitHub write has already succeeded; never encourage a duplicate retry
    // because a derived cache could not be cleared.
    logServerEvent('error', {
      event: 'directory_cache_invalidation_failed',
      owner,
      repo,
      branch,
      ...serverErrorDetails(error),
    })
  }
}

export async function staleDirectoryCache(
  database: Database,
  owner: string,
  repo: string,
  branch: string,
  paths?: string[],
  preservedRevision?: string | null,
  source = DEFAULT_REPOSITORY_SOURCE,
  repositoryId?: number,
) {
  invalidateRepositoryReads(owner, repo, source)
  const identity =
    repositoryId === undefined
      ? repositoryAddressQuery(source, owner, repo).sql
      : '?'
  const rows = await all<{
    id: number
    path: string
    status: string
    commitSha: string | null
    updatedAt: number
  }>(
    database,
    `SELECT id, path, status, commit_sha AS commitSha, updated_at AS updatedAt
    FROM cache_file_meta WHERE source = ? AND repository_id = ${identity} AND branch = ?`,
    [
      source,
      ...(repositoryId === undefined
        ? repositoryAddressQuery(source, owner, repo).args
        : [repositoryId]),
      branch,
    ],
  )
  const scopes = rows.map((row) => ({
    ...row,
    updatedAt: new Date(row.updatedAt),
  }))
  const statements = scopes
    .filter(
      (scope) =>
        !(
          preservedRevision &&
          scope.status === 'ok' &&
          scope.commitSha === preservedRevision
        ) &&
        (!paths || affectsDirectory(scope.path, paths)),
    )
    .map((scope) => staleSnapshotStatement(scope))
  for (let offset = 0; offset < statements.length; offset += 100) {
    await executeAtomic(database, statements.slice(offset, offset + 100))
  }
}
