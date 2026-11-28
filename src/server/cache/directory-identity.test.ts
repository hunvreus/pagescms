import { createClient } from '@libsql/client'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { expect, it, vi } from 'vitest'
import { createLibSqlDatabase } from '#/server/db/client'
import { createGitHubApi } from '#/server/github/api'
import {
  createDirectoryCache,
  invalidateDirectoryCache,
  staleDirectoryCache,
} from '#/server/cache/directory'
import { observeRepositoryIdentity } from '#/server/access/repository-identity'

it('force refreshes a directory even when its cached data is fresh', async () => {
  const client = createClient({ url: 'file::memory:' })
  try {
    const database = createLibSqlDatabase(client)
    await migrate(database, { migrationsFolder: './drizzle' })
    const identity = await observeRepositoryIdentity(database, {
      id: 1,
      owner: 'o',
      repo: 'r',
    })
    const cache = createDirectoryCache({ database, repositoryId: identity.id })
    const api = {
      ...createGitHubApi('test', vi.fn<typeof fetch>()),
      getDirectorySnapshot: vi
        .fn()
        .mockResolvedValueOnce({ revision: 'old', entries: [] })
        .mockResolvedValueOnce({ revision: 'new', entries: [] }),
    }
    const input = {
      api,
      owner: 'o',
      repo: 'r',
      branch: 'main',
      path: 'posts',
      context: 'collection' as const,
      enabled: true,
    }
    await expect(cache.get(input)).resolves.toMatchObject({ revision: 'old' })
    await expect(cache.get(input)).resolves.toMatchObject({ revision: 'old' })
    await expect(
      cache.get({ ...input, forceRefresh: true }),
    ).resolves.toMatchObject({ revision: 'new' })
    expect(api.getDirectorySnapshot).toHaveBeenCalledTimes(2)
  } finally {
    client.close()
  }
})

it('rechecks a stale media folder against GitHub when another worker cached the old head', async () => {
  const client = createClient({ url: 'file::memory:' })
  try {
    const database = createLibSqlDatabase(client)
    await migrate(database, { migrationsFolder: './drizzle' })
    const identity = await observeRepositoryIdentity(database, {
      id: 1,
      owner: 'o',
      repo: 'r',
    })
    let head = 'before'
    const file = {
      type: 'file' as const,
      name: 'photo.png',
      path: 'media/photo.png',
      sha: 'blob',
      size: 1,
      content: null,
      downloadUrl: null,
    }
    const api = {
      ...createGitHubApi('test', vi.fn<typeof fetch>()),
      getBranchHead: async () => 'before',
      getRefSha: vi.fn(async () => head),
      getMediaDirectory: vi.fn(
        async (_owner: string, _repo: string, revision: string) =>
          revision === 'before' ? [file] : [],
      ),
    }
    let now = Date.now()
    const checkInterval = 300_000
    const cache = createDirectoryCache({
      database,
      repositoryId: identity.id,
      clock: { now: () => new Date(now) },
      ttlMs: checkInterval,
    })
    const input = {
      api,
      owner: 'o',
      repo: 'r',
      branch: 'main',
      path: 'media',
      context: 'media' as const,
      enabled: true,
    }
    await expect(cache.get(input)).resolves.toMatchObject({ entries: [file] })
    head = 'after'
    await staleDirectoryCache(
      database,
      'o',
      'r',
      'main',
      [file.path, 'media/sub/photo.png'],
      undefined,
      'github.com',
      identity.id,
    )
    for (let read = 0; read < 2; read++) {
      await expect(cache.get(input)).resolves.toMatchObject({
        revision: 'after',
        entries: [],
      })
    }
    expect(api.getRefSha).toHaveBeenCalledTimes(2)
    expect(api.getMediaDirectory).toHaveBeenCalledTimes(2)

    now += checkInterval + 1
    await expect(cache.get(input)).resolves.toMatchObject({
      revision: 'after',
      entries: [],
    })
    expect(api.getRefSha).toHaveBeenCalledTimes(3)
    expect(api.getMediaDirectory).toHaveBeenCalledTimes(2)
  } finally {
    client.close()
  }
})

it('removes a deleted collection directory from the cache', async () => {
  const client = createClient({ url: 'file::memory:' })
  try {
    const database = createLibSqlDatabase(client)
    await migrate(database, { migrationsFolder: './drizzle' })
    const identity = await observeRepositoryIdentity(database, {
      id: 1,
      owner: 'o',
      repo: 'r',
    })
    const cache = createDirectoryCache({ database, repositoryId: identity.id })
    const api = {
      ...createGitHubApi('test', vi.fn<typeof fetch>()),
      getDirectorySnapshot: vi
        .fn()
        .mockResolvedValueOnce({
          revision: 'a',
          entries: [
            {
              type: 'file',
              name: 'a.md',
              path: 'posts/a.md',
              sha: 'a',
              content: 'old',
              size: 3,
              downloadUrl: null,
            },
          ],
        })
        .mockResolvedValueOnce({ revision: 'b', entries: [], missing: true }),
    }
    const input = {
      api,
      owner: 'o',
      repo: 'r',
      branch: 'main',
      path: 'posts',
      context: 'collection' as const,
      enabled: true,
    }
    await cache.get(input)
    await expect(cache.refresh(input)).resolves.toMatchObject({ entries: [] })
    const rows = await client.execute('SELECT path FROM cache_file')
    expect(rows.rows).toEqual([])
    expect(
      (await client.execute('SELECT path FROM cache_file_meta')).rows,
    ).toEqual([])
  } finally {
    client.close()
  }
})

it('keeps a newer listing when an older missing response arrives late', async () => {
  const client = createClient({ url: 'file::memory:' })
  try {
    const database = createLibSqlDatabase(client)
    await migrate(database, { migrationsFolder: './drizzle' })
    const identity = await observeRepositoryIdentity(database, {
      id: 1,
      owner: 'o',
      repo: 'r',
    })
    const cache = () =>
      createDirectoryCache({ database, repositoryId: identity.id })
    const entry = {
      type: 'file' as const,
      name: 'new.md',
      path: 'posts/new.md',
      sha: 'blob',
      content: 'new',
      size: 3,
      downloadUrl: null,
    }
    let release!: () => void
    const api = {
      ...createGitHubApi('test', vi.fn<typeof fetch>()),
      getDirectorySnapshot: vi
        .fn(async () => ({ revision: 'new', entries: [entry] }))
        .mockImplementationOnce(async () => {
          await new Promise<void>((resolve) => {
            release = resolve
          })
          return { revision: 'old', missing: true, entries: [] }
        }),
    }
    const input = {
      api,
      owner: 'o',
      repo: 'r',
      branch: 'main',
      path: 'posts',
      context: 'collection' as const,
      enabled: true,
    }
    const older = cache().refresh(input)
    await vi.waitFor(() => expect(release).toBeTypeOf('function'))
    const expected = { revision: 'new', entries: [entry] }
    await expect(cache().refresh(input)).resolves.toMatchObject(expected)
    release()
    await expect(older).resolves.toMatchObject(expected)
    await expect(cache().get(input)).resolves.toMatchObject(expected)
    expect(api.getDirectorySnapshot).toHaveBeenCalledTimes(2)
  } finally {
    client.close()
  }
})

it('keeps reads, refreshes and concurrent loads on the admitted repository after address reuse', async () => {
  const client = createClient({ url: 'file::memory:' })
  try {
    const database = createLibSqlDatabase(client)
    await migrate(database, { migrationsFolder: './drizzle' })
    const original = await observeRepositoryIdentity(database, {
      id: 101,
      owner: 'o',
      repo: 'r',
    })
    const cache = createDirectoryCache({ database, repositoryId: original.id })
    const entry = (content: string) => ({
      type: 'file' as const,
      name: 'a.md',
      path: 'posts/a.md',
      content,
      sha: content,
      size: content.length,
      downloadUrl: null,
    })
    const api = {
      ...createGitHubApi('test', vi.fn<typeof fetch>()),
      getBranchHead: undefined,
      getDirectorySnapshot: undefined,
      getRefSha: vi.fn(async () => 'head-a'),
      getDirectory: vi.fn(async () => [entry('private original')]),
    }
    const input = {
      api,
      owner: 'o',
      repo: 'r',
      branch: 'main',
      path: 'posts',
      context: 'collection' as const,
      enabled: true,
    }
    await cache.get(input)
    await observeRepositoryIdentity(database, {
      id: 101,
      owner: 'o',
      repo: 'renamed',
    })
    const replacement = await observeRepositoryIdentity(database, {
      id: 202,
      owner: 'o',
      repo: 'r',
    })
    const other = createDirectoryCache({
      database,
      repositoryId: replacement.id,
    })
    const otherApi = {
      ...api,
      getRefSha: vi.fn(async () => 'head-b'),
      getDirectory: vi.fn(async () => [entry('replacement')]),
    }
    // The unchanged-revision path must read the original snapshot, too.
    await expect(cache.refresh(input)).resolves.toMatchObject({
      entries: [entry('private original')],
    })
    await expect(other.get({ ...input, api: otherApi })).resolves.toMatchObject(
      { entries: [entry('replacement')] },
    )
    await expect(cache.get(input)).resolves.toMatchObject({
      entries: [entry('private original')],
    })
    let release!: () => void
    api.getRefSha.mockResolvedValue('new-a')
    api.getDirectory.mockImplementationOnce(async () => {
      await new Promise<void>((r) => {
        release = r
      })
      return [entry('new private original')]
    })
    const refreshing = cache.refresh(input)
    await vi.waitFor(() => expect(release).toBeTypeOf('function'))
    await expect(
      other.refresh({ ...input, api: otherApi }),
    ).resolves.toMatchObject({ entries: [entry('replacement')] })
    release()
    await refreshing
    await expect(other.get({ ...input, api: otherApi })).resolves.toMatchObject(
      { entries: [entry('replacement')] },
    )
  } finally {
    client.close()
  }
})

it('publishes and refreshes a directory snapshot on D1', async () => {
  const { Miniflare } = await import('miniflare')
  const { readdir, readFile } = await import('node:fs/promises')
  const { createD1Database } = await import('#/server/db/client')
  const worker = new Miniflare({
    modules: true,
    script: 'export default {fetch(){return new Response("ok")}}',
    compatibilityDate: '2026-07-30',
    d1Databases: { DATABASE: 'cache-write' },
  })
  try {
    const binding = await worker.getD1Database('DATABASE')
    for (const name of (await readdir('drizzle'))
      .filter((file) => file.endsWith('.sql'))
      .sort()) {
      const statements = (await readFile(`drizzle/${name}`, 'utf8'))
        .split('--> statement-breakpoint')
        .map((value) => value.trim())
        .filter(Boolean)
      await binding.batch(
        statements.map((statement) => binding.prepare(statement)),
      )
    }
    const database = createD1Database(binding)
    const identity = await observeRepositoryIdentity(database, {
      id: 1,
      owner: 'owner',
      repo: 'repo',
    })
    const api = {
      ...createGitHubApi('test', vi.fn<typeof fetch>()),
      getBranchHead: undefined,
      getDirectorySnapshot: undefined,
      getRefSha: vi.fn(async () => 'head'),
      getDirectory: vi.fn(async () => [
        {
          type: 'file' as const,
          name: 'a.md',
          path: 'posts/a.md',
          sha: 'sha',
          content: 'hello',
          size: 5,
          downloadUrl: null,
        },
      ]),
    }
    const cache = createDirectoryCache({ database, repositoryId: identity.id })
    const input = {
      api,
      owner: 'owner',
      repo: 'repo',
      branch: 'main',
      path: 'posts',
      context: 'collection' as const,
      enabled: true,
    }
    expect(await cache.get(input)).toMatchObject({
      revision: 'head',
      entries: [{ content: 'hello' }],
    })
    expect(await cache.refresh(input)).toMatchObject({
      revision: 'head',
      entries: [{ content: 'hello' }],
    })
    expect(api.getDirectory).toHaveBeenCalledOnce()
    const { applyRepositoryPush } = await import('#/server/cache/repository')
    api.getRefSha.mockResolvedValue('next')
    expect(
      await applyRepositoryPush(
        database,
        api,
        {
          repositoryId: identity.id,
          owner: 'owner',
          repo: 'repo',
          branch: 'main',
          before: 'head',
          after: 'next',
          changes: [{ path: 'posts/a.md', removed: false }],
        },
        [
          {
            type: 'file',
            name: 'a.md',
            path: 'posts/a.md',
            sha: 'new',
            content: 'updated',
            size: 7,
            downloadUrl: null,
          },
        ],
      ),
    ).toBe(true)
    expect(await cache.get(input)).toMatchObject({
      revision: 'next',
      entries: [{ content: 'updated' }],
    })
    const node = {
      type: 'file' as const,
      name: 'index.md',
      path: 'docs/a/index.md',
      sha: 'node',
      content: 'cached node',
      size: 11,
      downloadUrl: null,
    }
    const nodeApi = {
      ...api,
      getRefSha: vi.fn(async () => 'tree'),
      getDirectory: vi.fn(
        async (_owner: string, _repo: string, _ref: string, path: string) =>
          path === 'docs/a'
            ? [node]
            : [
                {
                  type: 'dir' as const,
                  name: 'a',
                  path: 'docs/a',
                  sha: null,
                  content: null,
                  size: null,
                  downloadUrl: null,
                },
              ],
      ),
      getFiles: vi.fn(async () => []),
    }
    await cache.refresh({ ...input, api: nodeApi, path: 'docs/a' })
    expect(
      await cache.get({
        ...input,
        api: nodeApi,
        path: 'docs',
        nodeFilename: 'index.md',
      }),
    ).toMatchObject({
      entries: expect.arrayContaining([node]),
    })
    expect(nodeApi.getFiles).not.toHaveBeenCalled()
    const snapshotFetch = vi.fn(async () =>
      Response.json({
        data: {
          repository: {
            object: {
              oid: 'snapshot-head',
              file: { object: { entries: [] } },
            },
          },
        },
      }),
    )
    const snapshotApi = createGitHubApi('test', snapshotFetch, 15_000, 15_000, {
      id: 1,
      nodeId: 'node-1',
    })
    expect(
      await cache.get({ ...input, api: snapshotApi, path: 'snapshot' }),
    ).toMatchObject({
      revision: 'snapshot-head',
      entries: [],
    })
    expect(snapshotFetch).toHaveBeenCalledOnce()
    await staleDirectoryCache(
      database,
      'owner',
      'repo',
      'main',
      ['docs/a/index.md'],
      undefined,
      'github.com',
      identity.id,
    )
    const stale = await binding
      .prepare(
        "SELECT status FROM cache_file_meta WHERE repository_id = ? AND path = 'docs/a'",
      )
      .bind(identity.id)
      .first<{ status: string }>()
    expect(stale?.status).toBe('stale')
    await invalidateDirectoryCache(
      database,
      'owner',
      'repo',
      'main',
      'github.com',
      identity.id,
    )
    const remaining = await binding
      .prepare(
        'SELECT count(*) AS count FROM cache_file_meta WHERE repository_id = ?',
      )
      .bind(identity.id)
      .first<{ count: number }>()
    expect(remaining?.count).toBe(0)
  } finally {
    await worker.dispose()
  }
})
