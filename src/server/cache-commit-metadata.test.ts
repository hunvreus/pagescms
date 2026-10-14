import { afterEach, describe, expect, it, vi } from 'vitest'
import { createClient } from '@libsql/client'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { readMigrationFiles } from 'drizzle-orm/migrator'
import { createLibSqlDatabase } from './database/client.server'
import { cacheFileMetaTable, cacheFileTable } from './database/schema'
import { publishCacheSnapshot } from './directory-cache-store.server'
import type {
  RepositoryDirectoryEntry,
  RepositoryApi,
} from './repository-provider.server'
import {
  applyRepositoryPush,
  updateRepositoryCacheAfterMutation,
} from './repository-cache.server'

const clients: ReturnType<typeof createClient>[] = []
afterEach(() => {
  for (const client of clients.splice(0)) client.close()
})

async function fixture() {
  const client = createClient({ url: 'file::memory:' })
  clients.push(client)
  const database = createLibSqlDatabase(client)
  await migrate(database, { migrationsFolder: './drizzle' })
  const scope = {
    source: 'github.com',
    owner: 'owner',
    repo: 'repo',
    branch: 'main',
    path: 'posts',
    context: 'collection',
  }
  await database
    .insert(cacheFileMetaTable)
    .values({ ...scope, status: 'stale' })
  let time = Date.parse('2026-10-13T10:00:00Z')
  const publish = async (
    entries: RepositoryDirectoryEntry[],
    revision: string,
    commitTimestamp?: string,
    unchanged = false,
  ) => {
    const snapshot = (await database.select().from(cacheFileMetaTable))[0]
    const now = new Date(time++)
    expect(
      await publishCacheSnapshot(database, {
        scope,
        snapshot,
        entries,
        removed: [],
        revision,
        commitTimestamp,
        now,
        unchanged,
      }),
    ).toBe(true)
  }
  return { database, publish }
}
const entry: RepositoryDirectoryEntry = {
  type: 'file',
  name: 'a.md',
  path: 'posts/a.md',
  sha: 'blob-a',
  content: 'a',
  size: 1,
  downloadUrl: null,
}
const date = '2026-10-12T10:00:00.000Z'

describe('cache commit provenance', () => {
  it('separates snapshot freshness from real commit dates and preserves unchanged file provenance', async () => {
    const { database, publish } = await fixture()
    await publish(
      [{ ...entry, commitSha: 'change-a', commitTimestamp: date }],
      'head-a',
      date,
    )
    const firstMeta = (await database.select().from(cacheFileMetaTable))[0]
    expect(firstMeta.refreshedAt!.getTime()).toBeGreaterThan(Date.parse(date))
    expect(firstMeta.commitTimestamp).toEqual(new Date(date))
    const firstFile = (await database.select().from(cacheFileTable))[0]
    await publish([entry], 'head-b')
    const file = (await database.select().from(cacheFileTable))[0]
    expect(file).toEqual(firstFile)
    expect(
      (await database.select().from(cacheFileMetaTable))[0].commitSha,
    ).toBe('head-b')
    expect(file.commitSha).toBe('change-a')
    expect(file.commitTimestamp).toEqual(new Date(date))
    expect(
      (await database.select().from(cacheFileMetaTable))[0].commitTimestamp,
    ).toBeNull()
    await publish([{ ...entry, sha: 'blob-b', content: 'b' }], 'head-c')
    const changed = (await database.select().from(cacheFileTable))[0]
    expect(changed.commitSha).toBeNull()
    expect(changed.commitTimestamp).toBeNull()
  })

  it('records explicit same-content commits and does not reset freshness on an unchanged check', async () => {
    const { database, publish } = await fixture()
    await publish([entry], 'head-a')
    expect(
      (await database.select().from(cacheFileTable))[0].commitSha,
    ).toBeNull()
    await publish(
      [{ ...entry, commitSha: 'change-b', commitTimestamp: date }],
      'head-b',
      date,
    )
    expect((await database.select().from(cacheFileTable))[0].commitSha).toBe(
      'change-b',
    )
    const before = (await database.select().from(cacheFileMetaTable))[0]
    await publish([], 'head-b', undefined, true)
    const after = (await database.select().from(cacheFileMetaTable))[0]
    expect(after.refreshedAt).toEqual(before.refreshedAt)
    expect(after.commitTimestamp).toEqual(before.commitTimestamp)
    expect(after.updatedAt.getTime()).toBeGreaterThan(
      before.updatedAt.getTime(),
    )
  })
})

it('migrates historical publication time to refreshedAt without changing the cache version', async () => {
  const client = createClient({ url: 'file::memory:' })
  clients.push(client)
  const migrations = readMigrationFiles({ migrationsFolder: './drizzle' })
  for (const migration of migrations.slice(0, 6)) {
    for (const statement of migration.sql)
      if (statement.trim()) await client.execute(statement)
  }
  await client.execute(
    "insert into cache_file_meta (owner, repo, branch, path, commit_sha, commit_timestamp, updated_at, last_checked_at) values ('owner', 'repo', 'main', 'posts', 'head', 123, 456, 456)",
  )
  for (const statement of migrations[6].sql)
    if (statement.trim()) await client.execute(statement)
  const result = await client.execute(
    'select refreshed_at, commit_timestamp, updated_at, commit_sha from cache_file_meta',
  )
  expect(result.rows[0]).toMatchObject({
    refreshed_at: 123,
    commit_timestamp: null,
    updated_at: 456,
    commit_sha: 'head',
  })
})

it('captures mutation provenance and leaves it unchanged for duplicate and delayed pushes', async () => {
  const { database, publish } = await fixture()
  await publish([entry], 'head-a')
  const api = {
    source: 'github.com',
    getRefSha: vi.fn().mockResolvedValue('head-b'),
    getFiles: vi.fn().mockResolvedValue([]),
  } as unknown as RepositoryApi
  await updateRepositoryCacheAfterMutation(
    database,
    api,
    'owner',
    'repo',
    'main',
    { commitSha: 'head-b', parentCommitSha: 'head-a', commitTimestamp: date },
    [{ path: entry.path, removed: false }],
    [entry],
  )
  const first = (await database.select().from(cacheFileTable))[0]
  expect(first.commitSha).toBe('head-b')
  expect(first.commitTimestamp).toEqual(new Date(date))
  const coordinates = { owner: 'owner', repo: 'repo', branch: 'main' }
  expect(
    await applyRepositoryPush(database, api, {
      ...coordinates,
      before: 'head-a',
      after: 'head-b',
      changes: [
        {
          path: entry.path,
          removed: false,
          commitSha: 'head-b',
          commitTimestamp: date,
        },
      ],
    }),
  ).toBe(true)
  expect(
    await applyRepositoryPush(database, api, {
      ...coordinates,
      before: 'older-head',
      after: 'head-a',
      changes: [
        {
          path: entry.path,
          removed: false,
          commitSha: 'head-a',
          commitTimestamp: '2026-10-14T10:00:00Z',
        },
      ],
    }),
  ).toBe(false)
  expect((await database.select().from(cacheFileTable))[0]).toEqual(first)
  expect(api.getFiles).not.toHaveBeenCalled()
})

it('migrates known file commits without keeping old per-file snapshot revisions', async () => {
  const client = createClient({ url: 'file::memory:' })
  clients.push(client)
  const migrations = readMigrationFiles({ migrationsFolder: './drizzle' })
  for (const migration of migrations.slice(0, 7)) {
    for (const statement of migration.sql)
      if (statement.trim()) await client.execute(statement)
  }
  await client.execute(
    "insert into cache_file_meta (owner, repo, branch, path, commit_sha, commit_timestamp, refreshed_at, updated_at, last_checked_at) values ('owner', 'repo', 'main', 'posts', 'snapshot', 100, 200, 300, 400)",
  )
  for (const [name, changeSha, timestamp] of [
    ['known', 'change-a', 123],
    ['unknown', null, null],
    ['unpaired-date', null, 456],
    ['unpaired-commit', 'change-b', null],
  ] as const) {
    await client.execute({
      sql: "insert into cache_file (owner, repo, branch, parent_path, name, path, type, content, sha, commit_sha, change_commit_sha, commit_timestamp, updated_at) values ('owner', 'repo', 'main', 'posts', ?, ?, 'file', 'content', 'blob', 'old-snapshot', ?, ?, 789)",
      args: [name, `posts/${name}.md`, changeSha, timestamp],
    })
  }
  const beforeMeta = (await client.execute('select * from cache_file_meta'))
    .rows
  for (const statement of migrations[7].sql)
    if (statement.trim()) await client.execute(statement)
  const rows = (await client.execute('select * from cache_file order by name'))
    .rows
  expect(rows.find((row) => row.name === 'known')).toMatchObject({
    commit_sha: 'change-a',
    commit_timestamp: 123,
  })
  for (const row of rows) {
    expect(row).toMatchObject({
      content: 'content',
      sha: 'blob',
      updated_at: 789,
    })
    expect(row).not.toHaveProperty('change_commit_sha')
    if (row.name !== 'known') {
      expect(row.commit_sha).toBeNull()
      expect(row.commit_timestamp).toBeNull()
    }
  }
  expect((await client.execute('select * from cache_file_meta')).rows).toEqual(
    beforeMeta,
  )
})
