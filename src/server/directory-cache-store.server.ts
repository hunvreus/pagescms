import { and, eq, inArray, sql } from 'drizzle-orm'

import { databaseStatement, executeAtomic } from './database/core.server'

import type { Database, DatabaseStatement } from './database/client.server'
import type { RepositoryDirectoryEntry } from './repository-provider.server'
import { cacheFileMetaTable, cacheFileTable } from './database/schema'

export type CacheScope = {
  source: string
  owner: string
  repo: string
  branch: string
  path: string
  context: string
}

export type CacheSnapshot = Pick<
  typeof cacheFileMetaTable.$inferSelect,
  'id' | 'updatedAt'
>

export type CachePublication = Readonly<{
  claimIndex: number
  statements: readonly DatabaseStatement[]
}>

export function cacheBranch(
  input: Pick<CacheScope, 'source' | 'owner' | 'repo' | 'branch'>,
) {
  return and(
    eq(cacheFileMetaTable.source, input.source),
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
    eq(cacheFileTable.source, input.source),
    eq(cacheFileTable.owner, input.owner.toLowerCase()),
    eq(cacheFileTable.repo, input.repo.toLowerCase()),
    eq(cacheFileTable.branch, input.branch),
    eq(cacheFileTable.parentPath, input.path),
    eq(cacheFileTable.context, input.context),
  )
}

// SQLite timestamps are integer milliseconds. Advancing from both wall time
// and the observed value makes each successful publication token monotonic.
export const nextCacheVersion = sql`max(
  cast((julianday('now') - 2440587.5) * 86400000 as integer),
  ${cacheFileMetaTable.updatedAt} + 1
)`

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

export async function markCacheStale(database: Database, scope: CacheScope) {
  await database
    .update(cacheFileMetaTable)
    .set({
      status: 'stale',
      publicationToken: null,
      updatedAt: nextCacheVersion,
    })
    .where(cacheScope(scope))
}

function versionAfter(snapshot: CacheSnapshot, now: Date, offset = 1) {
  return new Date(
    Math.max(now.getTime(), snapshot.updatedAt.getTime() + offset),
  )
}

function jsonChunks<T>(values: readonly T[], maximumBytes = 1_000_000) {
  const chunks: string[] = []
  let current: T[] = []
  let currentBytes = 2
  for (const value of values) {
    const encoded = JSON.stringify(value)
    const bytes = new TextEncoder().encode(encoded).byteLength + 1
    if (current.length && currentBytes + bytes > maximumBytes) {
      chunks.push(JSON.stringify(current))
      current = []
      currentBytes = 2
    }
    current.push(value)
    currentBytes += bytes
  }
  if (current.length) chunks.push(JSON.stringify(current))
  return chunks
}

function deleteStatements(
  scope: CacheScope,
  snapshot: CacheSnapshot,
  publicationToken: string,
  removed: readonly string[],
): DatabaseStatement[] {
  return jsonChunks(removed).map((paths) => ({
    sql: `delete from cache_file
      where source = ? and owner = ? and repo = ? and branch = ? and parent_path = ? and context = ?
      and path in (select value from json_each(?))
      and exists (
        select 1 from cache_file_meta
        where id = ? and publication_token = ?
      )`,
    args: [
      scope.source,
      scope.owner.toLowerCase(),
      scope.repo.toLowerCase(),
      scope.branch,
      scope.path,
      scope.context,
      paths,
      snapshot.id,
      publicationToken,
    ],
  }))
}

function upsertStatements(
  scope: CacheScope,
  snapshot: CacheSnapshot,
  publicationToken: string,
  entries: readonly RepositoryDirectoryEntry[],
  revision: string,
  now: Date,
): DatabaseStatement[] {
  const rows = entries.map((entry) => ({
    path: entry.path,
    name: entry.name,
    type: entry.type,
    content: scope.context === 'media' ? null : entry.content,
    sha: entry.sha,
    size: entry.size,
  }))
  return jsonChunks(rows).map((values) => ({
    sql: `with guarded as (
        select 1 from cache_file_meta where id = ? and publication_token = ?
      ), items as (
        select
          json_extract(value, '$.path') as path,
          json_extract(value, '$.name') as name,
          json_extract(value, '$.type') as type,
          json_extract(value, '$.content') as content,
          json_extract(value, '$.sha') as sha,
          json_extract(value, '$.size') as size
        from json_each(?)
      )
      insert into cache_file (
        source, context, owner, repo, branch, parent_path, name, path, type,
        content, sha, size, commit_sha, updated_at
      )
      select ?, ?, ?, ?, ?, ?, items.name, items.path, items.type,
        items.content, items.sha, items.size, ?, ?
      from guarded cross join items
      where true
      on conflict(source, owner, repo, branch, path, context) do update set
        name = excluded.name,
        type = excluded.type,
        content = excluded.content,
        sha = excluded.sha,
        size = excluded.size,
        commit_sha = excluded.commit_sha,
        updated_at = excluded.updated_at`,
    args: [
      snapshot.id,
      publicationToken,
      values,
      scope.source,
      scope.context,
      scope.owner.toLowerCase(),
      scope.repo.toLowerCase(),
      scope.branch,
      scope.path,
      revision,
      now.getTime(),
    ],
  }))
}

export async function buildCachePublication(
  database: Database,
  input: {
    scope: CacheScope
    snapshot: CacheSnapshot
    entries: readonly RepositoryDirectoryEntry[]
    removed: readonly string[]
    revision: string
    now: Date
    unchanged?: boolean
  },
): Promise<CachePublication> {
  const { scope, snapshot, entries, removed, revision, now } = input
  const byPath = new Map<string, typeof cacheFileTable.$inferSelect>()
  for (let offset = 0; offset < entries.length; offset += 80) {
    const existing = await database
      .select()
      .from(cacheFileTable)
      .where(
        and(
          cacheRows(scope),
          inArray(
            cacheFileTable.path,
            entries.slice(offset, offset + 80).map((entry) => entry.path),
          ),
        ),
      )
    for (const row of existing) byPath.set(row.path, row)
  }
  const changed = input.unchanged
    ? []
    : entries.filter((entry) => {
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
  const claim = versionAfter(snapshot, now)
  const finalized = versionAfter(snapshot, now, 2)
  const publicationToken = crypto.randomUUID()
  const statements: DatabaseStatement[] = [
    {
      sql: `update cache_file_meta set updated_at = ?, publication_token = ?
        where id = ? and updated_at = ?`,
      args: [
        claim.getTime(),
        publicationToken,
        snapshot.id,
        snapshot.updatedAt.getTime(),
      ],
    },
    ...deleteStatements(scope, snapshot, publicationToken, removed),
    ...upsertStatements(
      scope,
      snapshot,
      publicationToken,
      changed,
      revision,
      now,
    ),
    {
      sql: `update cache_file_meta set
          commit_sha = ?, status = 'ok', error = null,
          last_checked_at = ?,
          commit_timestamp = case when ? then commit_timestamp else ? end,
          updated_at = ?, publication_token = null
        where id = ? and publication_token = ?`,
      args: [
        revision,
        now.getTime(),
        input.unchanged ? 1 : 0,
        now.getTime(),
        finalized.getTime(),
        snapshot.id,
        publicationToken,
      ],
    },
  ]
  return { claimIndex: 0, statements }
}

export async function executeCachePublications(
  database: Database,
  publications: readonly CachePublication[],
) {
  const published: boolean[] = []
  // A scope is the consistency boundary. Keep each scope in one atomic batch,
  // but do not combine unrelated scopes into an unbounded D1 request.
  for (const publication of publications) {
    const results = await executeAtomic(database, publication.statements)
    published.push(results[publication.claimIndex]?.rowsAffected === 1)
  }
  return published
}

export async function publishCacheSnapshot(
  database: Database,
  input: Parameters<typeof buildCachePublication>[1],
) {
  const publication = await buildCachePublication(database, input)
  return (await executeCachePublications(database, [publication]))[0] ?? false
}

export function staleSnapshotStatement(
  database: Database,
  scope: CacheScope,
  snapshot: CacheSnapshot,
  now = new Date(),
) {
  return databaseStatement(
    database
      .update(cacheFileMetaTable)
      .set({
        status: 'stale',
        publicationToken: null,
        updatedAt: versionAfter(snapshot, now),
      })
      .where(
        and(
          cacheScope(scope),
          eq(cacheFileMetaTable.id, snapshot.id),
          eq(cacheFileMetaTable.updatedAt, snapshot.updatedAt),
        ),
      ),
  )
}
