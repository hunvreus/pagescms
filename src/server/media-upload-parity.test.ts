import { beforeEach, describe, expect, it, vi } from 'vitest'
import { prepareMediaUpload, uploadMedia } from './media-service.server'
import type { Database } from './database/client.server'
import type { RepositoryAccessService } from './repository-access.server'

const mocks = vi.hoisted(() => ({ get: vi.fn(), write: vi.fn() }))
vi.mock('./configuration-store.server', () => ({
  createConfigurationStore: () => ({ get: mocks.get }),
}))
vi.mock('./directory-cache.server', () => ({
  createDirectoryCache: () => ({}),
  invalidateDirectoryCacheAfterMutation: vi.fn(),
}))
vi.mock('./repository-cache.server', () => ({
  updateRepositoryCacheAfterMutation: vi.fn(),
}))
vi.mock('./media-provider.server', () => ({
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
