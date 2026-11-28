import { repositoryRows } from '../../../tests/repository-fixture'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createClient } from '@libsql/client'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { createLibSqlDatabase } from '#/server/db/client'
import { cacheFileMetaTable, cacheFileTable } from '#/server/db/schema'
import { publishCacheSnapshot } from '#/server/cache/directory-store'
import type {
  RepositoryDirectoryEntry,
  RepositoryApi,
} from '../repository/provider'
import {
  applyRepositoryPush,
  updateRepositoryCacheAfterMutation,
} from '#/server/cache/repository'

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
    .values(await repositoryRows(database, { ...scope, status: 'stale' }))
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
