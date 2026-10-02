import { and, eq, inArray } from 'drizzle-orm'

import type { Database } from './database/client.server'
import type {
  RepositoryApi,
  RepositoryDirectoryEntry,
} from './repository-provider.server'
import type { Clock } from './runtime-ports.server'

import { cacheFileMetaTable, cacheFileTable } from './database/schema'
import { systemClock } from './runtime-ports.server'
import { cachePolicy } from './cache-policy.server'
import {
  readRepositoryCached,
  invalidateRepositoryReads,
} from './repository-read-cache.server'
import {
  affectsDirectory,
  cacheBranch,
  cacheScope,
  parentDirectory,
  publishCacheSnapshot,
  staleSnapshotStatement,
} from './directory-cache-store.server'
import { databaseStatement, executeAtomic } from './database/core.server'
import { logServerEvent, serverErrorDetails } from './http'
import {
  DEFAULT_REPOSITORY_SOURCE,
  repositorySource,
} from './repository-provider.server'

const EPHEMERAL_MEDIA_TTL_MS = 30_000
const EPHEMERAL_MEDIA_MAX_ENTRIES = 32

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

export function createExpiringLoaderCache<T>({
  ttlMs,
  maximumEntries,
  now = () => Date.now(),
}: {
  ttlMs: number
  maximumEntries: number
  now?: () => number
}) {
  const cached = new Map<string, { value: T; expiresAt: number }>()
  const pending = new Map<string, Promise<T>>()
  const versions = new Map<string, number>()

  function set(key: string, value: T) {
    cached.delete(key)
    while (cached.size >= maximumEntries) {
      const oldest = cached.keys().next().value
      if (oldest === undefined) break
      cached.delete(oldest)
    }
    cached.set(key, { value, expiresAt: now() + ttlMs })
  }

  return {
    getOrLoad(key: string, load: () => Promise<T>) {
      const entry = cached.get(key)
      if (entry && entry.expiresAt > now()) return Promise.resolve(entry.value)
      if (entry) cached.delete(key)
      const existing = pending.get(key)
      if (existing) return existing
      const version = versions.get(key) ?? 0
      const request = load()
        .then((value) => {
          if ((versions.get(key) ?? 0) === version) set(key, value)
          return value
        })
        .finally(() => {
          if (pending.get(key) === request) {
            pending.delete(key)
            versions.delete(key)
          }
        })
      pending.set(key, request)
      return request
    },
    set,
    clear(predicate?: (key: string) => boolean) {
      const keys = new Set([...cached.keys(), ...pending.keys()])
      for (const key of keys) {
        if (!predicate || predicate(key)) {
          cached.delete(key)
          if (pending.has(key)) {
            versions.set(key, (versions.get(key) ?? 0) + 1)
          } else {
            versions.delete(key)
          }
        }
      }
    },
  }
}

const ephemeralMediaDirectories = createExpiringLoaderCache<DirectoryResult>({
  ttlMs: EPHEMERAL_MEDIA_TTL_MS,
  maximumEntries: EPHEMERAL_MEDIA_MAX_ENTRIES,
})

function mediaDirectoryKey(
  source: string,
  owner: string,
  repo: string,
  branch: string,
  path: string,
) {
  return JSON.stringify([
    source,
    owner.toLowerCase(),
    repo.toLowerCase(),
    branch,
    path,
  ])
}

export function invalidateEphemeralMediaDirectories(
  owner: string,
  repo: string,
  branch: string,
  source = DEFAULT_REPOSITORY_SOURCE,
) {
  invalidateRepositoryReads(owner, repo, source)
  const prefix = JSON.stringify([
    source,
    owner.toLowerCase(),
    repo.toLowerCase(),
    branch,
  ]).slice(0, -1)
  ephemeralMediaDirectories.clear((key) => key.startsWith(`${prefix},`))
}

const inFlightByDatabase = new WeakMap<
  Database,
  ReturnType<typeof createInFlightDeduper>
>()

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
  clock = systemClock,
  ttlMs = cachePolicy(database).checkMs,
}: {
  database: Database
  clock?: Clock
  ttlMs?: number
}) {
  const existingDeduper = inFlightByDatabase.get(database)
  const dedupe = existingDeduper ?? createInFlightDeduper()
  if (!existingDeduper) inFlightByDatabase.set(database, dedupe)

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
      source,
      owner.toLowerCase(),
      repo.toLowerCase(),
      branch,
      path,
      context,
      nodeFilename ?? null,
    ])
  }

  function conditions(
    source: string,
    owner: string,
    repo: string,
    branch: string,
    path: string,
    context: DirectoryContext,
  ) {
    return and(
      eq(cacheFileTable.source, source),
      eq(cacheFileTable.owner, owner.toLowerCase()),
      eq(cacheFileTable.repo, repo.toLowerCase()),
      eq(cacheFileTable.branch, branch),
      eq(cacheFileTable.parentPath, path),
      eq(cacheFileTable.context, context),
    )
  }

  function metaConditions(
    source: string,
    owner: string,
    repo: string,
    branch: string,
    path: string,
    context: DirectoryContext,
  ) {
    return and(
      eq(cacheFileMetaTable.source, source),
      eq(cacheFileMetaTable.owner, owner.toLowerCase()),
      eq(cacheFileMetaTable.repo, repo.toLowerCase()),
      eq(cacheFileMetaTable.branch, branch),
      eq(cacheFileMetaTable.path, path),
      eq(cacheFileMetaTable.context, context),
    )
  }

  async function cachedDirectory(
    source: string,
    owner: string,
    repo: string,
    branch: string,
    path: string,
    context: DirectoryContext,
  ) {
    const [meta, rows] = await Promise.all([
      database.query.cacheFileMetaTable.findFirst({
        where: metaConditions(source, owner, repo, branch, path, context),
      }),
      database
        .select()
        .from(cacheFileTable)
        .where(conditions(source, owner, repo, branch, path, context)),
    ])
    if (!meta) return null
    return {
      status: meta.status,
      revision: meta.commitSha,
      filledAt: meta.commitTimestamp ?? meta.updatedAt,
      lastCheckedAt: meta.lastCheckedAt,
      entries: rows.map((row): RepositoryDirectoryEntry => ({
        type: row.type === 'dir' ? 'dir' : 'file',
        name: row.name,
        path: row.path,
        sha: row.sha,
        content: row.content,
        size: row.size,
        // Delivery URLs are short-lived capabilities. They must never be read
        // from the durable manifest cache.
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
    const scope = {
      source,
      owner: owner.toLowerCase(),
      repo: repo.toLowerCase(),
      branch,
      path,
      context,
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      await database
        .insert(cacheFileMetaTable)
        .values({ ...scope, status: 'stale' })
        .onConflictDoNothing()
      const snapshot = (
        await database
          .select()
          .from(cacheFileMetaTable)
          .where(cacheScope(scope))
      ).at(0)!
      try {
        const revision = await readRepositoryCached(
          api,
          owner,
          repo,
          JSON.stringify(['head', branch]),
          cachePolicy(database).branchHeadMs,
          () => api.getRefSha(owner, repo, branch),
        )
        const filledAt = snapshot.commitTimestamp ?? snapshot.updatedAt
        const unchanged =
          snapshot.status === 'ok' &&
          snapshot.commitSha === revision &&
          (cachePolicy(database).fileMs === -1 ||
            clock.now().getTime() - filledAt.getTime() <=
              cachePolicy(database).fileMs)
        const entries = unchanged
          ? ((await cachedDirectory(source, owner, repo, branch, path, context))
              ?.entries ?? [])
          : context === 'media'
            ? await api.getMediaDirectory(owner, repo, revision, path)
            : await readRepositoryCached(
                api,
                owner,
                repo,
                JSON.stringify(['collection', revision, path]),
                0,
                () => api.getDirectory(owner, repo, revision, path),
              )
        const existing = unchanged
          ? []
          : await database
              .select({ path: cacheFileTable.path })
              .from(cacheFileTable)
              .where(conditions(source, owner, repo, branch, path, context))
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
          // Only origin-bearing directory results belong in the delivery cache.
          if (context === 'media' && !unchanged)
            ephemeralMediaDirectories.set(
              mediaDirectoryKey(source, owner, repo, branch, path),
              { entries },
            )
          return { entries, revision }
        }
      } catch (error) {
        // A failed old refresh must not overwrite a newer successful publication.
        await executeAtomic(database, [
          databaseStatement(
            database
              .update(cacheFileMetaTable)
              .set({
                status: 'error',
                error: 'Directory refresh failed. Retry to update the cache.',
                updatedAt: new Date(
                  Math.max(
                    clock.now().getTime(),
                    snapshot.updatedAt.getTime() + 1,
                  ),
                ),
              })
              .where(
                and(
                  eq(cacheFileMetaTable.id, snapshot.id),
                  eq(cacheFileMetaTable.updatedAt, snapshot.updatedAt),
                ),
              ),
          ),
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

  function loadDirect(
    api: RepositoryApi,
    owner: string,
    repo: string,
    branch: string,
    path: string,
    context: DirectoryContext,
    nodeFilename?: string,
  ) {
    const source = repositorySource(api)
    if (context === 'media') {
      return ephemeralMediaDirectories.getOrLoad(
        mediaDirectoryKey(source, owner, repo, branch, path),
        async () => ({
          entries: await api.getMediaDirectory(owner, repo, branch, path),
        }),
      )
    }
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
      nodeFilename?: string
    }) {
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
      // Collection snapshots include the same directory metadata. Reuse them for
      // media, never the reverse: a media snapshot has no collection content.
      if (
        input.context === 'media' &&
        (!cached ||
          cached.status !== 'ok' ||
          !isDirectoryCacheFresh(cached.lastCheckedAt, clock.now(), ttlMs))
      ) {
        const collection = await cachedDirectory(
          source,
          input.owner,
          input.repo,
          input.branch,
          input.path,
          'collection',
        )
        if (
          collection?.status === 'ok' &&
          isDirectoryCacheFresh(collection.lastCheckedAt, clock.now(), ttlMs) &&
          (cachePolicy(database).fileMs === -1 ||
            clock.now().getTime() - collection.filledAt.getTime() <=
              cachePolicy(database).fileMs)
        ) {
          return {
            revision: collection.revision,
            entries: collection.entries
              .filter((entry) => {
                const separator = entry.path.lastIndexOf('/')
                return (
                  (separator < 0 ? '' : entry.path.slice(0, separator)) ===
                  input.path
                )
              })
              .map((entry) => ({ ...entry, content: null, downloadUrl: null })),
          }
        }
      }
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
      if (cached) {
        return dedupedRefresh(
          input.api,
          input.owner,
          input.repo,
          input.branch,
          input.path,
          input.context,
          input.nodeFilename,
        )
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
  return {
    ...cache,
    async get(
      input: Parameters<typeof cache.get>[0],
    ): Promise<DirectoryResult> {
      const result = await cache.get(input)
      const source = repositorySource(input.api)
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
      const metas = await database
        .select()
        .from(cacheFileMetaTable)
        .where(
          and(
            cacheBranch({ source, ...input }),
            eq(cacheFileMetaTable.context, 'collection'),
            eq(cacheFileMetaTable.status, 'ok'),
          ),
        )
      const rows = await database
        .select()
        .from(cacheFileTable)
        .where(
          and(
            eq(cacheFileTable.owner, input.owner.toLowerCase()),
            eq(cacheFileTable.source, repositorySource(input.api)),
            eq(cacheFileTable.repo, input.repo.toLowerCase()),
            eq(cacheFileTable.branch, input.branch),
            eq(cacheFileTable.context, 'collection'),
            inArray(cacheFileTable.path, paths),
          ),
        )
      const nodes: RepositoryDirectoryEntry[] = rows
        .filter(
          (row) =>
            result.revision &&
            metas.some(
              (meta) =>
                meta.path === row.parentPath &&
                meta.commitSha === result.revision,
            ),
        )
        .map((row) => ({
          type: 'file',
          path: row.path,
          name: row.name,
          content: row.content,
          sha: row.sha,
          size: row.size,
          downloadUrl: null,
        }))
      const found = new Set(nodes.map((node) => node.path))
      const missing = paths.filter((path) => !found.has(path))
      if (missing.length)
        nodes.push(
          ...(await input.api.getFiles(
            input.owner,
            input.repo,
            result.revision ?? input.branch,
            missing,
          )),
        )
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
) {
  invalidateEphemeralMediaDirectories(owner, repo, branch, source)
  const normalizedOwner = owner.toLowerCase()
  const normalizedRepo = repo.toLowerCase()
  await executeAtomic(database, [
    databaseStatement(
      database
        .delete(cacheFileTable)
        .where(
          and(
            eq(cacheFileTable.owner, normalizedOwner),
            eq(cacheFileTable.source, source),
            eq(cacheFileTable.repo, normalizedRepo),
            eq(cacheFileTable.branch, branch),
          ),
        ),
    ),
    databaseStatement(
      database
        .delete(cacheFileMetaTable)
        .where(
          and(
            eq(cacheFileMetaTable.owner, normalizedOwner),
            eq(cacheFileMetaTable.source, source),
            eq(cacheFileMetaTable.repo, normalizedRepo),
            eq(cacheFileMetaTable.branch, branch),
          ),
        ),
    ),
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
) {
  invalidateEphemeralMediaDirectories(owner, repo, branch, source)
  const scopes = await database
    .select()
    .from(cacheFileMetaTable)
    .where(cacheBranch({ source, owner, repo, branch }))
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
    .map((scope) => staleSnapshotStatement(database, scope, scope))
  for (let offset = 0; offset < statements.length; offset += 100) {
    await executeAtomic(database, statements.slice(offset, offset + 100))
  }
}
