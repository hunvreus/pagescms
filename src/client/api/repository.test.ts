import { afterEach, expect, it, vi } from 'vitest'
import { readRepositoryData } from '#/client/api/repository'

afterEach(() => vi.unstubAllGlobals())

it('restores the configuration date in the browser response', async () => {
  vi.stubGlobal('window', {})
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({
        configuration: { lastCheckedAt: '2026-01-01T00:00:00.000Z' },
      }),
    ),
  )
  const repositoryData = await readRepositoryData({
    owner: 'owner',
    repo: 'site',
    branch: 'feature/test',
  })
  expect(repositoryData.configuration?.lastCheckedAt).toEqual(
    new Date('2026-01-01T00:00:00.000Z'),
  )
  expect(fetch).toHaveBeenCalledWith(
    '/api/repository?owner=owner&repo=site&branch=feature%2Ftest',
    { cache: 'no-store' },
  )
})
