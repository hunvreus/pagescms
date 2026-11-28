import { createClient } from '@libsql/client'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { createLibSqlDatabase } from '#/server/db/client'
import { observeRepositoryIdentity } from '#/server/access/repository-identity'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createGitHubApi } from '#/server/github/api'
import { loadMediaDelivery, loadMediaPreview } from './media'
import { MediaRevisionMismatchError } from './provider'
import type * as Provider from './provider'
import type { Database } from '#/server/db/client'

const state = vi.hoisted(() => ({
  list: vi.fn(),
  read: vi.fn(),
  resolve: vi.fn(),
  resolveOrigins: vi.fn(),
  resolveAssets: vi.fn(),
  preview: vi.fn(),
  selection: vi.fn(),
}))
vi.mock('#/server/cache/configuration', () => ({
  createConfigurationStore: () => ({
    get: async () => ({
      object: {
        media: [{ name: 'images', input: 'images', output: '/images' }],
      },
    }),
  }),
}))
vi.mock('#/server/cache/directory', () => ({
  createDirectoryCache: () => ({}),
  invalidateDirectoryCacheAfterMutation: vi.fn(),
}))
vi.mock('./provider', async (original) => ({
  ...(await original<typeof Provider>()),
  resolveMediaProvider: async ({
    selection,
  }: Parameters<typeof Provider.resolveMediaProvider>[0]) => {
    state.selection(selection)
    return {
      storage: {
        id: 'fixture',
        list: state.list,
        read: state.read,
        resolveOrigins: state.resolveOrigins,
      },
      delivery: {
        id: 'processor',
        resolveAssets: state.resolveAssets,
        preview: state.preview,
        resolve: state.resolve,
      },
    }
  },
}))
const input = {
  database: {} as Database,
  repositoryAccess: {
    resolve: vi.fn(async () => ({
      api: createGitHubApi('preview-fixture', vi.fn<typeof fetch>()),
      tokenSource: 'user' as const,
    })),
  },
  user: { id: 'user', email: 'u@example.com', githubUsername: null },
  owner: 'o',
  repo: 'r',
  branch: 'main',
  name: 'images',
  path: 'images/a.png',
}
const asset = {
  id: input.path,
  kind: 'file',
  path: input.path,
  name: 'a.png',
  sha: 'v1',
  size: 4,
  contentType: 'image/png',
}
beforeEach(() => {
  vi.clearAllMocks()
  state.list.mockResolvedValue({ directory: 'images', assets: [asset] })
  state.read.mockResolvedValue({ version: 'v1', bytes: new Uint8Array(4) })
  state.resolveAssets.mockResolvedValue([
    {
      assetId: asset.id,
      path: asset.path,
      cacheKey: 'v1:thumbnail',
      url: '/protected',
      expiresAt: null,
    },
  ])
  state.resolveOrigins.mockResolvedValue([])
  state.resolve.mockResolvedValue([])
  state.preview.mockImplementation(async ({ read }) => {
    await read()
    return {
      body: new Response('processed').body,
      contentType: 'image/webp',
      etag: '"derivative"',
      notModified: false,
    }
  })
})
describe('identity-based media previews', () => {
  it('uses the application owner identity even when the cache still has the old owner', async () => {
    const appClient = createClient({ url: 'file::memory:' })
    const cacheClient = createClient({ url: 'file::memory:' })
    try {
      const database = createLibSqlDatabase(appClient)
      const cacheDatabase = createLibSqlDatabase(cacheClient)
      const fixture = { owner: input.owner, repo: input.repo, id: 42 }
      for (const [store, ownerId] of [
        [database, 21],
        [cacheDatabase, 20],
      ] as const) {
        await migrate(store, { migrationsFolder: './drizzle' })
        await observeRepositoryIdentity(store, { ...fixture, ownerId })
      }
      await loadMediaDelivery({
        ...input,
        database: cacheDatabase,
        identityDatabase: database,
        mediaProviderResolver: {
          resolveStorage: () => null,
          resolveDelivery: () => null,
        },
        paths: [input.path],
      })
      expect(state.selection).toHaveBeenCalledWith(
        expect.objectContaining({
          repoId: '42',
          ownerId: '21',
        }),
      )
    } finally {
      appClient.close()
      cacheClient.close()
    }
  })

  it('mints variant URLs without resolving raw origin URLs', async () => {
    const result = await loadMediaDelivery({
      ...input,
      paths: [input.path],
      variant: 'thumbnail',
    })
    expect(result.leases).toHaveLength(1)
    expect(state.resolveOrigins).not.toHaveBeenCalled()
  })
  it('checks current identity before the processor and checks read version before cache publication', async () => {
    await expect(
      loadMediaPreview({ ...input, variant: 'thumbnail', revision: 'old' }),
    ).rejects.toBeInstanceOf(MediaRevisionMismatchError)
    expect(state.preview).not.toHaveBeenCalled()
    expect(state.list).toHaveBeenLastCalledWith('images', {
      forceRefresh: true,
    })
    state.read.mockResolvedValue({ version: 'v2', bytes: new Uint8Array(4) })
    await expect(
      loadMediaPreview({ ...input, variant: 'thumbnail', revision: 'v1' }),
    ).rejects.toBeInstanceOf(MediaRevisionMismatchError)
  })
  it('returns transformed MIME types and conditional responses', async () => {
    const result = await loadMediaPreview({
      ...input,
      variant: 'thumbnail',
      revision: 'v1',
    })
    expect(result.contentType).toBe('image/webp')
    await result.body?.cancel()
    const notModified = await loadMediaPreview({
      ...input,
      variant: 'thumbnail',
      revision: 'v1',
      ifNoneMatch: '"derivative"',
    })
    expect(notModified).toMatchObject({ notModified: true, body: null })
  })
})
