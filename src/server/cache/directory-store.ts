import { ensureRepositoryIdentity } from '#/server/access/repository-identity'

import { executeAtomic } from '#/server/db/core'
import { all } from '#/server/db/sql'

import type { Database, DatabaseStatement } from '#/server/db/client'
import type { RepositoryDirectoryEntry } from '#/server/repository/provider'
import type { cacheFileMetaTable } from '#/server/db/schema'

export type CacheScope = {
  repositoryId?: number
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

function versionAfter(snapshot: CacheSnapshot, now: Date, offset = 1) {
  return new Date(
    Math.max(now.getTime(), snapshot.updatedAt.getTime() + offset),
  )
}

function jsonChunks<T>(values: readonly T[], maximumBytes = 1_000_000) {
  const chunks: string[] = []
  let current: T[] = []
  let currentBytes = 2
  const encoder = new TextEncoder()
  for (const value of values) {
    const encoded = JSON.stringify(value)
    const bytes = encoder.encode(encoded).byteLength + 1
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
      where repository_id = ? and branch = ? and parent_path = ? and context = ?
      and path in (select value from json_each(?))
      and exists (
        select 1 from cache_file_meta
        where id = ? and publication_token = ?
      )`,
    args: [
      scope.repositoryId!,
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
  now: Date,
): DatabaseStatement[] {
  const rows = entries.map((entry) => ({
    path: entry.path,
    name: entry.name,
    type: entry.type,
    content: scope.context === 'media' ? null : entry.content,
    sha: entry.sha,
    size: entry.size,
    commitSha: entry.commitSha ?? null,
    commitTimestamp:
      entry.commitTimestamp &&
      Number.isFinite(Date.parse(entry.commitTimestamp))
        ? Date.parse(entry.commitTimestamp)
        : null,
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
          json_extract(value, '$.size') as size,
          json_extract(value, '$.commitSha') as commit_sha,
          json_extract(value, '$.commitTimestamp') as commit_timestamp
        from json_each(?)
      )
      insert into cache_file (
        repository_id, source, context, owner, repo, branch, parent_path, name, path, type,
        content, sha, size, commit_sha, commit_timestamp, updated_at
      )
      select ?, ?, ?, ?, ?, ?, ?, items.name, items.path, items.type,
        items.content, items.sha, items.size, items.commit_sha, items.commit_timestamp, ?
      from guarded cross join items
      where true
      on conflict(repository_id, branch, path, context) do update set
        name = excluded.name,
        type = excluded.type,
        content = excluded.content,
        commit_sha = case
          when excluded.commit_sha is not null and excluded.commit_timestamp is not null then excluded.commit_sha
          when cache_file.sha is excluded.sha then cache_file.commit_sha else null end,
        commit_timestamp = case
          when excluded.commit_sha is not null and excluded.commit_timestamp is not null then excluded.commit_timestamp
          when cache_file.sha is excluded.sha then cache_file.commit_timestamp else null end,
        sha = excluded.sha,
        size = excluded.size,
        updated_at = excluded.updated_at`,
    args: [
      snapshot.id,
      publicationToken,
      values,
      scope.repositoryId!,
      scope.source,
      scope.context,
      scope.owner.toLowerCase(),
      scope.repo.toLowerCase(),
      scope.branch,
      scope.path,
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
    commitTimestamp?: string
    now: Date
    unchanged?: boolean
  },
): Promise<CachePublication> {
  const { snapshot, entries, removed, revision, now } = input
  const scope = {
    ...input.scope,
    repositoryId:
      input.scope.repositoryId ??
      (await ensureRepositoryIdentity(database, input.scope)).id,
  }
  type Existing = {
    path: string
    sha: string | null
    type: string
    size: number | null
    content: string | null
    commitSha: string | null
    commitTimestamp: number | null
  }
  const byPath = new Map<string, Existing>()
  const reads: Promise<Existing[]>[] = []
  for (const paths of input.unchanged
    ? []
    : jsonChunks(entries.map((entry) => entry.path))) {
    reads.push(
      all<Existing>(
        database,
        `SELECT path, sha, type, size, content, commit_sha AS commitSha, commit_timestamp AS commitTimestamp FROM cache_file WHERE source = ? AND repository_id = ? AND branch = ? AND parent_path = ? AND context = ? AND path IN (SELECT value FROM json_each(?))`,
        [
          scope.source,
          scope.repositoryId,
          scope.branch,
          scope.path,
          scope.context,
          paths,
        ],
      ),
    )
  }
  for (const rows of await Promise.all(reads))
    for (const row of rows) byPath.set(row.path, row)
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
          previous.content !== content ||
          (entry.commitSha != null &&
            entry.commitTimestamp != null &&
            (previous.commitSha !== entry.commitSha ||
              previous.commitTimestamp !== Date.parse(entry.commitTimestamp)))
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
    ...upsertStatements(scope, snapshot, publicationToken, changed, now),
    {
      sql: `update cache_file_meta set
          commit_sha = ?, status = 'ok', error = null,
          last_checked_at = ?,
          refreshed_at = case when ? then refreshed_at else ? end,
          commit_timestamp = case when commit_sha = ? and ? is null then commit_timestamp else ? end,
          updated_at = ?, publication_token = null
        where id = ? and publication_token = ?`,
      args: [
        revision,
        now.getTime(),
        input.unchanged ? 1 : 0,
        now.getTime(),
        revision,
        input.commitTimestamp ? Date.parse(input.commitTimestamp) : null,
        input.commitTimestamp ? Date.parse(input.commitTimestamp) : null,
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
  snapshot: CacheSnapshot,
  now = new Date(),
) {
  return {
    sql: `UPDATE cache_file_meta SET status = 'stale', publication_token = NULL, updated_at = ?
      WHERE id = ? AND updated_at = ?`,
    args: [
      versionAfter(snapshot, now).getTime(),
      snapshot.id,
      snapshot.updatedAt.getTime(),
    ],
  }
}
