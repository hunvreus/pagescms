import { describe, expect, it, vi } from 'vitest'
import {
  invalidateRepositoryReads,
  readRepositoryCached,
  registerRepositoryReader,
} from './repository-read-cache.server'
import { defaultCachePolicy, parseCachePolicy } from './cache-policy.server'

describe('repository read caching', () => {
  it('bounds negative caching and preserves credential isolation and invalidation', async () => {
    vi.useFakeTimers()
    try {
      const fetcher = {},
        first = {},
        second = {},
        other = {}
      registerRepositoryReader(first, 'negative-a', fetcher)
      registerRepositoryReader(second, 'negative-a', fetcher)
      registerRepositoryReader(other, 'negative-b', fetcher)
      const error = new Error('denied')
      const load = vi.fn().mockRejectedValue(error)
      const read = (api: object) =>
        readRepositoryCached(
          api,
          'owner',
          'negative',
          'repository',
          60_000,
          load,
          () => true,
        )
      await expect(read(first)).rejects.toBe(error)
      await expect(read(second)).rejects.toBe(error)
      expect(load).toHaveBeenCalledTimes(1)
      await expect(read(other)).rejects.toBe(error)
      expect(load).toHaveBeenCalledTimes(2)
      vi.advanceTimersByTime(15_001)
      await expect(read(first)).rejects.toBe(error)
      expect(load).toHaveBeenCalledTimes(3)
      invalidateRepositoryReads('owner', 'negative')
      await expect(read(first)).rejects.toBe(error)
      expect(load).toHaveBeenCalledTimes(4)
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not retain transient failures by default', async () => {
    const api = {},
      load = vi.fn().mockRejectedValue(new Error('upstream unavailable'))
    await expect(
      readRepositoryCached(
        api,
        'owner',
        'transient',
        'repository',
        15_000,
        load,
      ),
    ).rejects.toThrow()
    await expect(
      readRepositoryCached(
        api,
        'owner',
        'transient',
        'repository',
        15_000,
        load,
      ),
    ).rejects.toThrow()
    expect(load).toHaveBeenCalledTimes(2)
  })
  it('coalesces readers with the same credential without sharing across credentials', async () => {
    const first = {},
      second = {},
      otherUser = {},
      fetcher = {}
    registerRepositoryReader(first, 'token-a', fetcher)
    registerRepositoryReader(second, 'token-a', fetcher)
    registerRepositoryReader(otherUser, 'token-b', fetcher)
    const load = vi.fn().mockResolvedValue('revision')
    await Promise.all(
      [first, second].map((api) =>
        readRepositoryCached(api, 'owner', 'repo', 'head', 15_000, load),
      ),
    )
    expect(load).toHaveBeenCalledTimes(1)
    await readRepositoryCached(otherUser, 'owner', 'repo', 'head', 15_000, load)
    expect(load).toHaveBeenCalledTimes(2)
    invalidateRepositoryReads('owner', 'repo')
    await readRepositoryCached(first, 'owner', 'repo', 'head', 15_000, load)
    expect(load).toHaveBeenCalledTimes(3)
  })

  it('does not retain a result invalidated during its fetch', async () => {
    const api = {}
    let resolve!: (value: string) => void
    let started!: () => void
    const ready = new Promise<void>((done) => {
      started = done
    })
    const pending = readRepositoryCached(
      api,
      'owner',
      'race',
      'head',
      15_000,
      () =>
        new Promise<string>((done) => {
          resolve = done
          started()
        }),
    )
    await ready
    invalidateRepositoryReads('owner', 'race')
    resolve('old')
    await pending
    expect(
      await readRepositoryCached(
        api,
        'owner',
        'race',
        'head',
        15_000,
        async () => 'new',
      ),
    ).toBe('new')
  })

  it('does not share reads between repository sources', async () => {
    const github = { source: 'github.com' }
    const local = { source: 'local:/workspace/site' }
    const load = vi.fn().mockResolvedValue('revision')

    await readRepositoryCached(github, 'owner', 'repo', 'head', 15_000, load)
    await readRepositoryCached(local, 'owner', 'repo', 'head', 15_000, load)

    expect(load).toHaveBeenCalledTimes(2)
    invalidateRepositoryReads('owner', 'repo', 'github.com')
    await readRepositoryCached(github, 'owner', 'repo', 'head', 15_000, load)
    await readRepositoryCached(local, 'owner', 'repo', 'head', 15_000, load)
    expect(load).toHaveBeenCalledTimes(3)
    invalidateRepositoryReads('owner', 'repo')
  })

  it('restores legacy defaults and TTL/threshold overrides', () => {
    expect(parseCachePolicy({})).toEqual(defaultCachePolicy)
    expect(
      parseCachePolicy({
        FILE_TTL_MIN: '-1',
        CACHE_CHECK_MIN: '2',
        CFG_CHECK_MIN: '3',
        REPO_META_TTL_MS: '40',
        WEBHOOK_PUSH_INCREMENTAL_MAX_FILES: '0',
      }),
    ).toMatchObject({
      fileMs: -1,
      checkMs: 120_000,
      configMs: 180_000,
      repositoryMs: 40,
      incrementalMax: 0,
    })
    expect(() => parseCachePolicy({ CACHE_CHECK_MIN: 'NaN' })).toThrow()
    expect(() => parseCachePolicy({ FILE_TTL_MIN: '-2' })).toThrow()
  })
})
