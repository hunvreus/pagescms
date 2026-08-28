import { describe, expect, it, vi } from 'vitest'

import {
  createDirectMediaDelivery,
  createGitHubMediaStorage,
  mediaUrlExpiry,
  resolveMediaProvider,
} from './media-provider.server'

import type { GitHubApi } from './github-api.server'

const now = new Date('2026-08-28T00:00:00.000Z')

describe('media URL expiry', () => {
  it('keeps unsigned public raw URLs immutable', () => {
    expect(
      mediaUrlExpiry(
        'https://raw.githubusercontent.com/pages-cms/pagescms/main/logo.png',
        now,
      ),
    ).toBeNull()
  })

  it('uses an explicit upstream expiry when available', () => {
    expect(
      mediaUrlExpiry(
        'https://objects.example/file.png?se=2026-08-28T00%3A10%3A00.000Z',
        now,
      ),
    ).toBe('2026-08-28T00:10:00.000Z')
  })

  it('bounds opaque signed URLs with a conservative lease', () => {
    expect(
      mediaUrlExpiry('https://raw.example/file.png?token=secret', now),
    ).toBe('2026-08-28T00:05:00.000Z')
  })

  it('does not expire unrelated query parameters', () => {
    expect(
      mediaUrlExpiry(
        'https://cdn.example/file.png?utm_source=pagescms&sv=2024-08-04',
        now,
      ),
    ).toBeNull()
  })
})

describe('GitHub media storage', () => {
  it('separates stable manifest metadata from delivery origins', async () => {
    const list = vi.fn().mockResolvedValue([
      {
        type: 'dir',
        name: 'archive',
        path: 'public/images/archive',
        sha: null,
        size: null,
      },
      {
        type: 'file',
        name: 'hero.png',
        path: 'public/images/hero.png',
        sha: 'hero-sha',
        size: 42,
      },
    ])
    const resolveDirectory = vi.fn().mockResolvedValue([
      {
        type: 'file',
        name: 'hero.png',
        path: 'public/images/hero.png',
        sha: 'hero-sha',
        size: 42,
        content: null,
        downloadUrl: 'https://raw.example/hero.png?token=temporary',
      },
      {
        type: 'file',
        name: 'broken.png',
        path: 'public/images/broken.png',
        sha: 'broken-sha',
        size: 1,
        content: null,
        downloadUrl: 'not a URL',
      },
    ])
    const api = {
      getFile: vi.fn().mockResolvedValue({
        content: 'base64',
        encoding: 'base64',
        path: 'public/images/hero.png',
        sha: 'hero-sha',
        size: 42,
      }),
      putFile: vi.fn().mockResolvedValue({
        path: 'public/images/hero.png',
        sha: 'new-sha',
        commitSha: 'commit-sha',
      }),
      deleteFile: vi.fn().mockResolvedValue({ commitSha: 'delete-commit' }),
      renameFile: vi.fn().mockResolvedValue({
        path: 'public/images/hero.png',
        newPath: 'public/images/new.png',
        sha: 'hero-sha',
        commitSha: 'move-commit',
      }),
    } as unknown as GitHubApi
    const storage = createGitHubMediaStorage({
      api,
      owner: 'Pages-CMS',
      repo: 'pagescms',
      branch: 'main',
      list,
      resolveDirectory,
      clock: { now: () => now },
    })

    expect(storage.capabilities).toEqual({
      createDirectory: true,
      directUpload: false,
      upload: true,
      move: true,
      rename: true,
      remove: true,
    })

    const manifest = await storage.list('public/images')
    expect(manifest).toEqual({
      provider: 'github',
      directory: 'public/images',
      assets: [
        {
          id: 'public/images/archive',
          kind: 'directory',
          name: 'archive',
          path: 'public/images/archive',
          sha: null,
          size: null,
          contentType: null,
        },
        {
          id: 'public/images/hero.png',
          kind: 'file',
          name: 'hero.png',
          path: 'public/images/hero.png',
          sha: 'hero-sha',
          size: 42,
          contentType: 'image/png',
        },
      ],
    })
    expect(JSON.stringify(manifest)).not.toContain('raw.example')

    const origins = await storage.resolveOrigins([
      'public/images/hero.png',
      'public/images/broken.png',
      'public/images/missing.png',
    ])
    expect(resolveDirectory).toHaveBeenCalledOnce()
    expect(resolveDirectory).toHaveBeenCalledWith('public/images')
    expect(origins).toEqual([
      {
        assetId: 'public/images/hero.png',
        path: 'public/images/hero.png',
        url: 'https://raw.example/hero.png?token=temporary',
        expiresAt: '2026-08-28T00:05:00.000Z',
        cacheKey: 'hero-sha',
      },
    ])

    await expect(storage.read('public/images/hero.png')).resolves.toEqual({
      version: 'hero-sha',
      bytes: Uint8Array.from([109, 171, 30, 235]),
    })
    expect(api.getFile).toHaveBeenCalledWith(
      'Pages-CMS',
      'pagescms',
      'public/images/hero.png',
      'main',
    )

    const metadata = {
      message: 'Update media',
      actor: { name: 'Ronan', email: 'ronan@example.com' },
    }
    await storage.write({
      path: 'public/images/hero.png',
      content: 'base64',
      metadata,
    })
    expect(api.putFile).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: 'Pages-CMS',
        repo: 'pagescms',
        branch: 'main',
        path: 'public/images/hero.png',
        committer: metadata.actor,
      }),
    )
    await expect(
      storage.createDirectory({
        path: 'public/images/archive',
        metadata,
      }),
    ).resolves.toMatchObject({
      path: 'public/images/archive',
      version: null,
    })
    await expect(
      storage.move({
        path: 'public/images/hero.png',
        destination: 'public/images/new.png',
        version: 'hero-sha',
        metadata,
      }),
    ).resolves.toMatchObject({ path: 'public/images/new.png' })
    await storage.remove({
      path: 'public/images/hero.png',
      version: 'hero-sha',
      metadata,
    })
    expect(api.deleteFile).toHaveBeenCalledOnce()
  })
})

describe('direct media delivery', () => {
  it('turns origins into equivalent browser leases', async () => {
    const origin = {
      assetId: 'sha',
      path: 'public/image.png',
      url: 'https://raw.example/image.png?token=temporary',
      expiresAt: '2026-08-28T00:05:00.000Z',
      cacheKey: 'sha',
    }
    await expect(
      createDirectMediaDelivery().resolve([origin]),
    ).resolves.toEqual([origin])
  })
})

describe('media provider resolution', () => {
  const selection = {
    owner: 'pages-cms',
    repo: 'pagescms',
    branch: 'main',
    media: {
      name: 'images',
      rootPath: 'public/images',
      output: null,
      extensions: ['png'],
    },
  }
  const fallbackStorage = {
    id: 'github',
    capabilities: {
      createDirectory: true,
      directUpload: false,
      upload: true,
      move: true,
      rename: true,
      remove: true,
    },
    list: vi.fn(),
    resolveOrigins: vi.fn(),
    read: vi.fn(),
    write: vi.fn(),
    createDirectory: vi.fn(),
    remove: vi.fn(),
    move: vi.fn(),
  }
  const fallbackDelivery = createDirectMediaDelivery()

  it('allows storage and delivery to be replaced independently', () => {
    const customDelivery = { id: 'cdn', resolve: vi.fn() }
    expect(
      resolveMediaProvider({
        selection,
        fallbackStorage,
        fallbackDelivery,
        resolver: {
          resolveStorage: () => null,
          resolveDelivery: () => customDelivery,
        },
      }),
    ).toEqual({ storage: fallbackStorage, delivery: customDelivery })
  })

  it('fails fast when a resolver returns an invalid provider', () => {
    expect(() =>
      resolveMediaProvider({
        selection,
        fallbackStorage,
        fallbackDelivery,
        resolver: {
          resolveStorage: () => ({ id: 'broken' }) as never,
          resolveDelivery: () => null,
        },
      }),
    ).toThrow('Invalid media storage provider')
  })

  it('rejects a provider that advertises direct upload without implementing it', () => {
    expect(() =>
      resolveMediaProvider({
        selection,
        fallbackStorage,
        fallbackDelivery,
        resolver: {
          resolveStorage: () => ({
            ...fallbackStorage,
            capabilities: {
              ...fallbackStorage.capabilities,
              directUpload: true,
            },
          }),
          resolveDelivery: () => null,
        },
      }),
    ).toThrow('Invalid media storage provider')
  })
})
