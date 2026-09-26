import { and, eq, inArray } from 'drizzle-orm'

import type { Database } from './database/client.server'
import type { GitHubApi, GitHubDirectoryEntry } from './github-api.server'
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
  markCacheStale,
  nextCacheVersion,
  parentDirectory,
  withCacheLock,
  writeCacheEntries,
} from './directory-cache-store.server'

const EPHEMERAL_MEDIA_TTL_MS = 30_000
const EPHEMERAL_MEDIA_MAX_ENTRIES = 32

type DirectoryContext = 'collection' | 'media'
type DirectoryResult = {
  entries: GitHubDirectoryEntry[]
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
  owner: string,
  repo: string,
  branch: string,
  path: string,
) {
  return JSON.stringify([owner.toLowerCase(), repo.toLowerCase(), branch, path])
}

export function invalidateEphemeralMediaDirectories(
  owner: string,
  repo: string,
  branch: string,
) {
  invalidateRepositoryReads(owner, repo)
  const prefix = JSON.stringify([
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
  ) {
    return JSON.stringify([
      mode,
      owner.toLowerCase(),
      repo.toLowerCase(),
      branch,
      path,
      context,
      nodeFilename ?? null,
    ])
  }

  function conditions(
    owner: string,
    repo: string,
    branch: string,
    path: string,
    context: DirectoryContext,
  ) {
    return and(
      eq(cacheFileTable.owner, owner.toLowerCase()),
      eq(cacheFileTable.repo, repo.toLowerCase()),
      eq(cacheFileTable.branch, branch),
      eq(cacheFileTable.parentPath, path),
      eq(cacheFileTable.context, context),
    )
  }

  function metaConditions(
    owner: string,
    repo: string,
    branch: string,
    path: string,
    context: DirectoryContext,
  ) {
    return and(
      eq(cacheFileMetaTable.owner, owner.toLowerCase()),
      eq(cacheFileMetaTable.repo, repo.toLowerCase()),
      eq(cacheFileMetaTable.branch, branch),
      eq(cacheFileMetaTable.path, path),
      eq(cacheFileMetaTable.context, context),
    )
  }

  async function cachedDirectory(
    owner: string,
    repo: string,
    branch: string,
    path: string,
    context: DirectoryContext,
  ) {
    const [meta, rows] = await Promise.all([
      database.query.cacheFileMetaTable.findFirst({
        where: metaConditions(owner, repo, branch, path, context),
      }),
      database
        .select()
        .from(cacheFileTable)
        .where(conditions(owner, repo, branch, path, context)),
    ])
    if (!meta) return null
    return {
      status: meta.status,
      revision: meta.commitSha,
      filledAt: meta.commitTimestamp ?? meta.updatedAt,
      lastCheckedAt: meta.lastCheckedAt,
      entries: rows.map((row): GitHubDirectoryEntry => ({
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
    api: GitHubApi,
    owner: string,
    repo: string,
    branch: string,
    path: string,
    context: DirectoryContext,
    nodeFilename?: string,
  ) {
    const scope = {
      owner: owner.toLowerCase(),
      repo: repo.toLowerCase(),
      branch,
      path,
      context,
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      const snapshot = await withCacheLock(
        database,
        scope,
        async (transaction) => {
          await transaction
            .insert(cacheFileMetaTable)
            .values({ ...scope, status: 'stale' })
            .onConflictDoNothing()
          return (
            await transaction
              .select()
              .from(cacheFileMetaTable)
              .where(cacheScope(scope))
          ).at(0)!
        },
      )
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
          ? ((await cachedDirectory(owner, repo, branch, path, context))
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
        const published = await withCacheLock(
          database,
          scope,
          async (transaction) => {
            const current = (
              await transaction
                .select()
                .from(cacheFileMetaTable)
                .where(cacheScope(scope))
            ).at(0)
            if (
              !current ||
              current.id !== snapshot.id ||
              current.updatedAt.getTime() !== snapshot.updatedAt.getTime()
            )
              return false
            if (!unchanged) {
              const existing = await transaction
                .select({ path: cacheFileTable.path })
                .from(cacheFileTable)
                .where(conditions(owner, repo, branch, path, context))
              const present = new Set(entries.map((entry) => entry.path))
              await writeCacheEntries(
                transaction,
                scope,
                entries,
                existing
                  .filter((entry) => !present.has(entry.path))
                  .map((entry) => entry.path),
                revision,
                clock.now(),
              )
            }
            await transaction
              .update(cacheFileMetaTable)
              .set({
                commitSha: revision,
                status: 'ok',
                error: null,
                lastCheckedAt: clock.now(),
                ...(!unchanged ? { commitTimestamp: clock.now() } : {}),
                updatedAt: nextCacheVersion,
              })
              .where(cacheScope(scope))
            return true
          },
        )
        if (published) {
          // Only origin-bearing directory results belong in the delivery cache.
          if (context === 'media' && !unchanged)
            ephemeralMediaDirectories.set(
              mediaDirectoryKey(owner, repo, branch, path),
              { entries },
            )
          return { entries, revision }
        }
      } catch (error) {
        // A failed old refresh must not overwrite a newer successful publication.
        await withCacheLock(database, scope, async (transaction) => {
          const current = (
            await transaction
              .select()
              .from(cacheFileMetaTable)
              .where(cacheScope(scope))
          ).at(0)
          if (
            current?.id === snapshot.id &&
            current.updatedAt.getTime() === snapshot.updatedAt.getTime()
          )
            await transaction
              .update(cacheFileMetaTable)
              .set({
                status: 'error',
                error: 'Directory refresh failed. Retry to update the cache.',
                updatedAt: nextCacheVersion,
              })
              .where(cacheScope(scope))
        }).catch(() => {})
        throw error
      }
    }
    // A busy branch can keep changing while we fetch. Return a fresh direct read without publishing it.
    return loadDirect(api, owner, repo, branch, path, context, nodeFilename)
  }

  function dedupedRefresh(
    api: GitHubApi,
    owner: string,
    repo: string,
    branch: string,
    path: string,
    context: DirectoryContext,
    nodeFilename?: string,
  ) {
    return dedupe(
      requestKey('refresh', owner, repo, branch, path, context, nodeFilename),
      () => refresh(api, owner, repo, branch, path, context, nodeFilename),
    )
  }

  function loadDirect(
    api: GitHubApi,
    owner: string,
    repo: string,
    branch: string,
    path: string,
    context: DirectoryContext,
    nodeFilename?: string,
  ) {
    if (context === 'media') {
      return ephemeralMediaDirectories.getOrLoad(
        mediaDirectoryKey(owner, repo, branch, path),
        async () => ({
          entries: await api.getMediaDirectory(owner, repo, branch, path),
        }),
      )
    }
    return dedupe(
      requestKey('direct', owner, repo, branch, path, context, nodeFilename),
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
      api: GitHubApi
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
      const cached = await cachedDirectory(
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
      api: GitHubApi
      owner: string
      repo: string
      branch: string
      path: string
      context: DirectoryContext
      nodeFilename?: string
    }) {
      invalidateRepositoryReads(input.owner, input.repo)
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
            cacheBranch(input),
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
            eq(cacheFileTable.repo, input.repo.toLowerCase()),
            eq(cacheFileTable.branch, input.branch),
            eq(cacheFileTable.context, 'collection'),
            inArray(cacheFileTable.path, paths),
          ),
        )
      const nodes: GitHubDirectoryEntry[] = rows
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
) {
  invalidateEphemeralMediaDirectories(owner, repo, branch)
  const normalizedOwner = owner.toLowerCase()
  const normalizedRepo = repo.toLowerCase()
  await withCacheLock(
    database,
    { owner, repo, branch },
    async (transaction) => {
      await transaction
        .delete(cacheFileTable)
        .where(
          and(
            eq(cacheFileTable.owner, normalizedOwner),
            eq(cacheFileTable.repo, normalizedRepo),
            eq(cacheFileTable.branch, branch),
          ),
        )
      await transaction
        .delete(cacheFileMetaTable)
        .where(
          and(
            eq(cacheFileMetaTable.owner, normalizedOwner),
            eq(cacheFileMetaTable.repo, normalizedRepo),
            eq(cacheFileMetaTable.branch, branch),
          ),
        )
    },
  )
}

export async function invalidateDirectoryCacheAfterMutation(
  database: Database,
  owner: string,
  repo: string,
  branch: string,
  paths?: string[],
  preservedRevision?: string | null,
) {
  try {
    await staleDirectoryCache(
      database,
      owner,
      repo,
      branch,
      paths,
      preservedRevision,
    )
  } catch (error) {
    // The GitHub write has already succeeded; never encourage a duplicate retry
    // because a derived cache could not be cleared.
    console.error('Could not invalidate directory cache after mutation', error)
  }
}

export async function staleDirectoryCache(
  database: Database,
  owner: string,
  repo: string,
  branch: string,
  paths?: string[],
  preservedRevision?: string | null,
) {
  invalidateEphemeralMediaDirectories(owner, repo, branch)
  await withCacheLock(
    database,
    { owner, repo, branch },
    async (transaction) => {
      const scopes = await transaction
        .select()
        .from(cacheFileMetaTable)
        .where(cacheBranch({ owner, repo, branch }))
      for (const scope of scopes) {
        if (
          preservedRevision &&
          scope.status === 'ok' &&
          scope.commitSha === preservedRevision
        )
          continue
        if (!paths || affectsDirectory(scope.path, paths))
          await markCacheStale(transaction, scope)
      }
    },
  )
}
