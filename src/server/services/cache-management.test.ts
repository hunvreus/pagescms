import { repositoryRows } from '../../../tests/repository-fixture'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createClient } from '@libsql/client'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { createLibSqlDatabase } from '#/server/db/client'
import { cacheFileTable } from '#/server/db/schema'
import { managementRequest } from '#/shared/requests/cache'
import { observeRepositoryIdentity } from '#/server/access/repository-identity'
import {
  loadCacheFiles,
  loadCacheStatus,
  manageCache,
} from '#/server/services/cache-management'

const clients: ReturnType<typeof createClient>[] = []
afterEach(() => {
  for (const client of clients.splice(0)) client.close()
})

async function fixture() {
  const client = createClient({ url: 'file::memory:' })
  clients.push(client)
  const database = createLibSqlDatabase(client)
  await migrate(database, { migrationsFolder: './drizzle' })
  await observeRepositoryIdentity(database, {
    id: 101,
    owner: 'Owner',
    repo: 'Repo',
  })
  const api = {
    getRepository: vi.fn().mockResolvedValue({ id: 101, canPush: true }),
    getFile: vi.fn().mockResolvedValue({
      sha: 'config-sha',
      content: btoa('settings:\n  cache: true\n'),
    }),
  }
  const input = {
    database,
    owner: 'Owner',
    repo: 'Repo',
    branch: 'main',
    user: {
      id: 'user',
      email: 'user@example.com',
      emailVerified: true,
      githubUsername: 'user',
    },
    repositoryAccess: {
      resolve: vi.fn().mockResolvedValue({ api, tokenSource: 'user' }),
    },
  }
  return { input, api }
}

describe('cached file inspection', () => {
  it('rejects removed refresh actions at the request boundary', () => {
    const coordinates = { owner: 'Owner', repo: 'Repo', branch: 'main' }
    for (const action of ['reconcile-content', 'refresh-configuration']) {
      expect(() => managementRequest({ ...coordinates, action })).toThrow(
        'Invalid cache action',
      )
    }
  })
  it('uses the cached opt-in without fetching configuration again', async () => {
    const { input, api } = await fixture()
    await loadCacheStatus(input)
    api.getFile.mockClear()
    await manageCache({ ...input, action: 'clear-all' })
    expect(api.getFile).not.toHaveBeenCalled()
  })

  it('clears configuration without reading it or requiring the opt-in', async () => {
    const { input, api } = await fixture()
    await manageCache({ ...input, action: 'clear-configuration' })
    expect(api.getFile).not.toHaveBeenCalled()
    api.getRepository.mockResolvedValue({ id: 101, canPush: false })
    await expect(
      manageCache({ ...input, action: 'clear-configuration' }),
    ).rejects.toThrow('write access')
  })

  it('pages branch-scoped metadata without returning content', async () => {
    const { input } = await fixture()
    await input.database.insert(cacheFileTable).values(
      await repositoryRows(
        input.database,
        Array.from({ length: 53 }, (_, i) => ({
          owner: 'owner',
          repo: 'repo',
          branch: i === 52 ? 'private-branch' : 'main',
          parentPath: 'posts',
          name: `file-${i}`,
          path: `posts/${String(i).padStart(2, '0')}.md`,
          type: 'file',
          sha: `file-sha-${i}`,
          commitSha: 'change-sha',
          content: 'private content',
          updatedAt: new Date(),
        })),
      ),
    )
    const first = await loadCacheFiles({ ...input, page: 0 })
    expect(first.files).toHaveLength(10)
    expect(first.hasMore).toBe(true)
    expect(first.files[0]).toMatchObject({
      path: 'posts/00.md',
      sha: 'file-sha-0',
      commitSha: 'change-sha',
    })
    expect(first.files[0]).not.toHaveProperty('content')
    const second = await loadCacheFiles({ ...input, page: 5 })
    expect(second.files.map((file) => file.path)).toEqual([
      'posts/50.md',
      'posts/51.md',
    ])
    expect(second.hasMore).toBe(false)
    const filtered = await loadCacheFiles({
      ...input,
      page: 0,
      search: 'POSTS/51',
    })
    expect(filtered.files.map((file) => file.path)).toEqual(['posts/51.md'])
    expect(filtered.hasMore).toBe(false)
  })
  it.each(['', 'settings:\n  cache: false\n'])(
    'denies cache inspection and content clearing when cache is not enabled: %s',
    async (source) => {
      const { input, api } = await fixture()
      api.getFile.mockResolvedValue({
        sha: 'disabled-config',
        content: btoa(source),
      })
      await expect(loadCacheStatus(input)).rejects.toThrow(
        'Cache management is disabled',
      )
      await expect(loadCacheFiles({ ...input, page: 0 })).rejects.toThrow(
        'Cache management is disabled',
      )
      await expect(
        manageCache({ ...input, action: 'clear-all' }),
      ).rejects.toThrow('Cache management is disabled')
    },
  )
  it('rejects installation credentials and direct users without write access', async () => {
    const { input, api } = await fixture()
    api.getRepository.mockResolvedValue({ canPush: false })
    await expect(loadCacheFiles({ ...input, page: 0 })).rejects.toThrow(
      'write access',
    )
    input.repositoryAccess.resolve.mockResolvedValue({
      api,
      tokenSource: 'installation',
    })
    await expect(loadCacheFiles({ ...input, page: 0 })).rejects.toThrow(
      'Only GitHub users',
    )
  })
})

it('reads cache management status and files from D1', async () => {
  const { Miniflare } = await import('miniflare')
  const { readdir, readFile } = await import('node:fs/promises')
  const { createD1Database } = await import('#/server/db/client')
  const { createConfigurationStore } =
    await import('#/server/cache/configuration')
  const worker = new Miniflare({
    modules: true,
    script: 'export default {fetch(){return new Response("ok")}}',
    compatibilityDate: '2026-07-30',
    d1Databases: { DATABASE: 'cache' },
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
      id: 101,
      owner: 'owner',
      repo: 'repo',
    })
    await createConfigurationStore({ database }).save(
      'owner',
      'repo',
      'main',
      'config',
      { settings: { cache: true } },
      undefined,
      identity.id,
    )
    await database.insert(cacheFileTable).values({
      repositoryId: identity.id,
      owner: 'owner',
      repo: 'repo',
      branch: 'main',
      parentPath: 'posts',
      name: 'a.md',
      path: 'posts/a.md',
      type: 'file',
      updatedAt: new Date(),
    })
    const input = {
      database,
      repositoryAccess: {
        resolve: vi.fn(async () => ({
          api: { getRepository: async () => ({ id: 101, canPush: true }) },
          tokenSource: 'user' as const,
        })),
      },
      user: { id: 'u', email: 'u@example.test', githubUsername: 'editor' },
      owner: 'owner',
      repo: 'repo',
      branch: 'main',
    } as unknown as Parameters<typeof loadCacheStatus>[0]
    expect(await loadCacheStatus(input)).toMatchObject({
      fileCount: 1,
      configuration: { sha: 'config' },
    })
    expect(
      await loadCacheFiles({ ...input, page: 0, search: 'POSTS' }),
    ).toMatchObject({ files: [{ path: 'posts/a.md' }], hasMore: false })
  } finally {
    await worker.dispose()
  }
})
