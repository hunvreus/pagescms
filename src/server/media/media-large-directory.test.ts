import { describe, expect, it, vi } from 'vitest'
import { createGitHubApi } from '#/server/github/api'
import { createGitHubMediaStorage } from './provider'
import type { RepositoryApi } from '../repository/provider'

const json = (value: unknown) =>
  new Response(JSON.stringify(value), {
    headers: { 'content-type': 'application/json' },
  })
const contents = Array.from({ length: 1000 }, (_, i) => ({
  type: 'file',
  name: `${i}.png`,
  path: `images/${i}.png`,
  sha: `blob-${i}`,
  size: 1,
  download_url: `https://raw.example/${i}?token=t`,
}))

describe('large GitHub media directories', () => {
  it('lists every tree entry and only reuses URLs matching its blob revision', async () => {
    const fetcher = vi.fn(async (url: RequestInfo | URL) => {
      const path = String(url)
      if (path.includes('/contents/images')) return json(contents)
      if (path.includes('/git/ref/')) return json({ object: { sha: 'head' } })
      if (path.endsWith('/git/trees/head'))
        return json({
          sha: 'root',
          truncated: false,
          tree: [{ path: 'images', type: 'tree', sha: 'images-tree' }],
        })
      if (path.endsWith('/git/trees/images-tree'))
        return json({
          sha: 'images-tree',
          truncated: false,
          tree: Array.from({ length: 1201 }, (_, i) => ({
            path: `${i}.png`,
            type: 'blob',
            sha: i === 0 ? 'changed' : `blob-${i}`,
            size: 1,
          })),
        })
      throw new Error(`Unexpected request ${path}`)
    })
    const entries = await createGitHubApi(
      'large-directory',
      fetcher,
    ).getMediaDirectory('o', 'r', 'main', 'images')
    expect(entries).toHaveLength(1201)
    expect(entries[0].downloadUrl).toBeNull()
    expect(entries[1].downloadUrl).toBe(contents[1].download_url)
    expect(entries[1200]).toMatchObject({
      path: 'images/1200.png',
      downloadUrl: null,
    })
    expect(fetcher).toHaveBeenCalledTimes(4)
  })

  it('rejects truncated trees rather than publishing a partial folder', async () => {
    const fetcher = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).includes('/contents/')) return json(contents)
      if (String(url).includes('/git/ref/'))
        return json({ object: { sha: 'head' } })
      return json({ sha: 'head', truncated: true, tree: [] })
    })
    await expect(
      createGitHubApi('truncated-media', fetcher).getMediaDirectory(
        'o',
        'r',
        'main',
        'images',
      ),
    ).rejects.toThrow('incomplete Git tree')
  })

  it.each([true, false])(
    'resolves only requested overflow assets (private=%s)',
    async (privateRepository) => {
      const getFileDownloadUrl = vi.fn(async (_o, _r, _b, path: string) => ({
        type: 'file',
        name: 'overflow.png',
        path,
        sha: 'v1',
        size: 1,
        content: null,
        downloadUrl: 'https://raw.example/overflow?token=fresh',
      }))
      const api = {
        getRefSha: vi.fn().mockResolvedValue('head'),
        getRepository: vi
          .fn()
          .mockResolvedValue({ private: privateRepository }),
        getFileDownloadUrl,
      } as unknown as RepositoryApi
      const entry = {
        type: 'file' as const,
        name: 'overflow.png',
        path: 'images/overflow.png',
        sha: 'v1',
        size: 1,
        content: null,
        downloadUrl: null,
      }
      const resolveDirectory = vi
        .fn()
        .mockResolvedValue([
          entry,
          { ...entry, name: 'unrequested.png', path: 'images/unrequested.png' },
        ])
      const storage = createGitHubMediaStorage({
        api,
        owner: 'o',
        repo: 'r',
        branch: 'main',
        list: async () => [],
        resolveDirectory,
      })
      const origins = await storage.resolveOrigins(['images/overflow.png'])
      expect(origins).toHaveLength(1)
      expect(origins[0].url).toBe(
        privateRepository
          ? 'https://raw.example/overflow?token=fresh'
          : 'https://raw.githubusercontent.com/o/r/head/images/overflow.png',
      )
      expect(getFileDownloadUrl).toHaveBeenCalledTimes(
        privateRepository ? 1 : 0,
      )
      expect(entry.downloadUrl).toBeNull()
      vi.mocked(api.getRepository).mockClear()
      vi.mocked(api.getRefSha).mockClear()
      await storage.resolveOrigins(['images/overflow.png'], {
        forceRefresh: true,
      })
      expect(resolveDirectory).toHaveBeenLastCalledWith('images', true)
      expect(api.getRepository).not.toHaveBeenCalled()
      expect(api.getRefSha).not.toHaveBeenCalled()
    },
  )
  it('uses each directory snapshot revision for public overflow URLs', async () => {
    const api = {
      getRepository: vi.fn().mockResolvedValue({ private: false }),
      getRefSha: vi.fn(),
    } as unknown as RepositoryApi
    const resolveDirectory = vi.fn(async (directory: string) => [
      {
        type: 'file' as const,
        name: 'a.png',
        path: `${directory}/a.png`,
        sha: 'blob',
        size: 1,
        content: null,
        downloadUrl: null,
        revision: directory === 'images/one' ? 'commit-one' : 'commit-two',
      },
    ])
    const storage = createGitHubMediaStorage({
      api,
      owner: 'o',
      repo: 'r',
      branch: 'main',
      list: async () => [],
      resolveDirectory,
    })
    const origins = await storage.resolveOrigins([
      'images/one/a.png',
      'images/two/a.png',
    ])
    expect(origins.map((origin) => origin.url)).toEqual([
      'https://raw.githubusercontent.com/o/r/commit-one/images/one/a.png',
      'https://raw.githubusercontent.com/o/r/commit-two/images/two/a.png',
    ])
    expect(api.getRefSha).not.toHaveBeenCalled()
  })
})
