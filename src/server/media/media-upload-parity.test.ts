import { beforeEach, describe, expect, it, vi } from 'vitest'
import { prepareMediaUpload, uploadMedia } from './media'
import type { Database } from '#/server/db/client'
import type { RepositoryAccessService } from '#/server/access/repository'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  write: vi.fn(),
  invalidate: vi.fn(),
}))
vi.mock('#/server/cache/configuration', () => ({
  createConfigurationStore: () => ({ get: mocks.get }),
}))
vi.mock('#/server/cache/directory', () => ({
  createDirectoryCache: () => ({}),
  invalidateDirectoryCacheAfterMutation: mocks.invalidate,
}))
vi.mock('#/server/cache/repository', () => ({
  updateRepositoryCacheAfterMutation: vi.fn(),
}))
vi.mock('./provider', () => ({
  createGitHubMediaStorage: () => ({ write: mocks.write }),
  createDirectMediaDelivery: () => ({}),
  resolveMediaProvider: ({
    fallbackStorage,
  }: {
    fallbackStorage: unknown
  }) => ({ storage: fallbackStorage, delivery: {} }),
}))
const input = {
  database: {} as Database,
  repositoryAccess: {
    resolve: async () => ({ api: {} }),
  } as unknown as RepositoryAccessService,
  user: {
    id: 'user',
    email: 'user@example.com',
    name: 'User',
    githubUsername: null,
  },
  owner: 'pagescms',
  repo: 'Test',
  branch: 'main',
  name: 'images',
  parent: 'assets',
  filename: 'My Photo.PNG',
  content: 'eA==',
  idempotencyKey: 'upload-one',
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.get.mockResolvedValue({
    repositoryId: 42,
    object: {
      media: [
        { name: 'images', input: 'assets', output: '/assets', rename: 'safe' },
      ],
    },
  })
  mocks.write.mockImplementation(async ({ path }: { path: string }) => ({
    path,
    revision: 'sha',
  }))
})
describe('media upload policy parity', () => {
  it('applies source defaults and honors explicit field overrides', async () => {
    expect((await uploadMedia(input)).path).toBe('assets/my-photo.png')
    expect((await uploadMedia({ ...input, rename: false })).path).toBe(
      'assets/My Photo.PNG',
    )
  })
  it.each(['github.com', 'local:/workspace/repo'])(
    'invalidates the provider source that owns the uploaded file: %s',
    async (source) => {
      await uploadMedia({
        ...input,
        repositoryAccess: {
          resolve: async () => ({ api: { source } }),
        } as unknown as RepositoryAccessService,
      })
      expect(mocks.invalidate).toHaveBeenCalledExactlyOnceWith(
        input.database,
        input.owner,
        input.repo,
        input.branch,
        ['assets/my-photo.png'],
        'sha',
        source,
        42,
      )
    },
  )
  it('uses the same random path for initiation and server upload', async () => {
    const prepared = await prepareMediaUpload({
      ...input,
      rename: 'random',
      size: 1,
      contentType: 'image/png',
    })
    expect((await uploadMedia({ ...input, rename: 'random' })).path).toBe(
      prepared.path,
    )
    expect(prepared.path).toMatch(/^assets\/[a-f0-9]{24}\.png$/)
  })
})
