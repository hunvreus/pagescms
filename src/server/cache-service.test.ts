import { afterEach, describe, expect, it, vi } from 'vitest'
import { createClient } from '@libsql/client'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { createLibSqlDatabase } from './database/client.server'
import { cacheFileTable } from './database/schema'
import {
  loadCacheFiles,
  loadCacheStatus,
  manageCache,
} from './cache-service.server'

const clients: ReturnType<typeof createClient>[] = []
afterEach(() => {
  for (const client of clients.splice(0)) client.close()
})

async function fixture() {
  const client = createClient({ url: 'file::memory:' })
  clients.push(client)
  const database = createLibSqlDatabase(client)
  await migrate(database, { migrationsFolder: './drizzle' })
  const api = {
    getRepository: vi.fn().mockResolvedValue({ canPush: true }),
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
  it('pages branch-scoped metadata without returning content', async () => {
    const { input } = await fixture()
    await input.database.insert(cacheFileTable).values(
      Array.from({ length: 53 }, (_, i) => ({
        owner: 'owner',
        repo: 'repo',
        branch: i === 52 ? 'private-branch' : 'main',
        parentPath: 'posts',
        name: `file-${i}`,
        path: `posts/${String(i).padStart(2, '0')}.md`,
        type: 'file',
        sha: `file-sha-${i}`,
        commitSha: 'snapshot-sha',
        content: 'private content',
        updatedAt: new Date(),
      })),
    )
    const first = await loadCacheFiles({ ...input, page: 0 })
    expect(first.files).toHaveLength(10)
    expect(first.hasMore).toBe(true)
    expect(first.files[0]).toMatchObject({
      path: 'posts/00.md',
      sha: 'file-sha-0',
      commitSha: 'snapshot-sha',
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
    'denies every management endpoint when cache is not enabled: %s',
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
