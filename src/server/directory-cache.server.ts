import { and, eq } from 'drizzle-orm'

import type { Database } from './database/client.server'
import type { GitHubApi, GitHubDirectoryEntry } from './github-api.server'
import type { Clock } from './runtime-ports.server'

import { cacheFileMetaTable, cacheFileTable } from './database/schema'
import { systemClock } from './runtime-ports.server'

const DEFAULT_DIRECTORY_TTL_MS = 60_000

type DirectoryContext = 'collection' | 'media'
type DirectoryResult = { entries: GitHubDirectoryEntry[] }

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
  ttlMs = DEFAULT_DIRECTORY_TTL_MS,
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
    const entries =
      context === 'media'
        ? await api.getMediaDirectory(owner, repo, branch, path)
        : await api.getDirectory(owner, repo, branch, path, nodeFilename)
    const checkedAt = clock.now()
    const normalizedOwner = owner.toLowerCase()
    const normalizedRepo = repo.toLowerCase()
    await database.transaction(async (transaction) => {
      await transaction
        .delete(cacheFileTable)
        .where(conditions(owner, repo, branch, path, context))
      if (entries.length) {
        await transaction.insert(cacheFileTable).values(
          entries.map((entry) => ({
            context,
            owner: normalizedOwner,
            repo: normalizedRepo,
            branch,
            parentPath: path,
            name: entry.name,
            path: entry.path,
            type: entry.type,
            content: entry.content,
            sha: entry.sha,
            size: entry.size,
            updatedAt: checkedAt,
          })),
        )
      }
      await transaction
        .insert(cacheFileMetaTable)
        .values({
          owner: normalizedOwner,
          repo: normalizedRepo,
          branch,
          path,
          context,
          status: 'ok',
          error: null,
          updatedAt: checkedAt,
          lastCheckedAt: checkedAt,
        })
        .onConflictDoUpdate({
          target: [
            cacheFileMetaTable.owner,
            cacheFileMetaTable.repo,
            cacheFileMetaTable.branch,
            cacheFileMetaTable.path,
            cacheFileMetaTable.context,
          ],
          set: {
            status: 'ok',
            error: null,
            updatedAt: checkedAt,
            lastCheckedAt: checkedAt,
          },
        })
    })
    return { entries }
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
    return dedupe(
      requestKey('direct', owner, repo, branch, path, context, nodeFilename),
      async () => ({
        entries:
          context === 'media'
            ? await api.getMediaDirectory(owner, repo, branch, path)
            : await api.getDirectory(owner, repo, branch, path, nodeFilename),
      }),
    )
  }

  return {
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
      if (
        cached &&
        isDirectoryCacheFresh(cached.lastCheckedAt, clock.now(), ttlMs)
      ) {
        return { entries: cached.entries }
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
}

export async function invalidateDirectoryCache(
  database: Database,
  owner: string,
  repo: string,
  branch: string,
) {
  const normalizedOwner = owner.toLowerCase()
  const normalizedRepo = repo.toLowerCase()
  await database.transaction(async (transaction) => {
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
  })
}

export async function invalidateDirectoryCacheAfterMutation(
  database: Database,
  owner: string,
  repo: string,
  branch: string,
) {
  try {
    await invalidateDirectoryCache(database, owner, repo, branch)
  } catch (error) {
    // The GitHub write has already succeeded; never encourage a duplicate retry
    // because a derived cache could not be cleared.
    console.error('Could not invalidate directory cache after mutation', error)
  }
}
