import { describe, expect, it } from 'vitest'

import {
  createExpiringLoaderCache,
  createInFlightDeduper,
  isDirectoryCacheFresh,
} from './directory-cache.server'

describe('directory cache', () => {
  it('treats cached data as fresh through the configured TTL boundary', () => {
    const checkedAt = new Date('2026-08-20T00:00:00.000Z')
    expect(
      isDirectoryCacheFresh(
        checkedAt,
        new Date('2026-08-20T00:01:00.000Z'),
        60_000,
      ),
    ).toBe(true)
    expect(
      isDirectoryCacheFresh(
        checkedAt,
        new Date('2026-08-20T00:01:00.001Z'),
        60_000,
      ),
    ).toBe(false)
    expect(isDirectoryCacheFresh(null, checkedAt, 60_000)).toBe(false)
  })

  it('shares concurrent loads and releases the key after completion', async () => {
    const dedupe = createInFlightDeduper()
    let resolve!: (value: { entries: [] }) => void
    let calls = 0
    const load = () => {
      calls += 1
      return new Promise<{ entries: [] }>((done) => {
        resolve = done
      })
    }

    const first = dedupe('directory', load)
    const second = dedupe('directory', load)
    expect(second).toBe(first)
    expect(calls).toBe(1)

    resolve({ entries: [] })
    await first
    await dedupe('directory', async () => {
      calls += 1
      return { entries: [] }
    })
    expect(calls).toBe(2)
  })

  it('releases failed loads so they can be retried', async () => {
    const dedupe = createInFlightDeduper()
    let calls = 0
    const fail = () => {
      calls += 1
      return Promise.reject(new Error('failed'))
    }

    const first = dedupe('directory', fail)
    expect(dedupe('directory', fail)).toBe(first)
    await expect(first).rejects.toThrow('failed')
    await expect(dedupe('directory', fail)).rejects.toThrow('failed')
    expect(calls).toBe(2)
  })
})

describe('ephemeral loader cache', () => {
  it('shares sequential and concurrent loads until expiry', async () => {
    let currentTime = 0
    let calls = 0
    const cache = createExpiringLoaderCache<number>({
      ttlMs: 30_000,
      maximumEntries: 10,
      now: () => currentTime,
    })
    const load = async () => {
      calls += 1
      return calls
    }

    const first = cache.getOrLoad('directory', load)
    const concurrent = cache.getOrLoad('directory', load)
    expect(concurrent).toBe(first)
    await expect(first).resolves.toBe(1)
    await expect(cache.getOrLoad('directory', load)).resolves.toBe(1)
    expect(calls).toBe(1)

    currentTime = 30_001
    await expect(cache.getOrLoad('directory', load)).resolves.toBe(2)
    expect(calls).toBe(2)
  })

  it('supports scoped invalidation and bounds retained entries', async () => {
    const cache = createExpiringLoaderCache<number>({
      ttlMs: 30_000,
      maximumEntries: 2,
    })
    cache.set('repo-a:first', 1)
    cache.set('repo-a:second', 2)
    cache.set('repo-b:first', 3)
    cache.clear((key) => key.startsWith('repo-a:'))

    await expect(cache.getOrLoad('repo-b:first', async () => 4)).resolves.toBe(
      3,
    )
    await expect(cache.getOrLoad('repo-a:second', async () => 5)).resolves.toBe(
      5,
    )
    await expect(cache.getOrLoad('repo-a:first', async () => 6)).resolves.toBe(
      6,
    )
  })

  it('does not retain an in-flight result invalidated before completion', async () => {
    const cache = createExpiringLoaderCache<number>({
      ttlMs: 30_000,
      maximumEntries: 10,
    })
    let resolve!: (value: number) => void
    const first = cache.getOrLoad(
      'repository:directory',
      () =>
        new Promise<number>((done) => {
          resolve = done
        }),
    )
    cache.clear((key) => key.startsWith('repository:'))
    resolve(1)
    await expect(first).resolves.toBe(1)
    await expect(
      cache.getOrLoad('repository:directory', async () => 2),
    ).resolves.toBe(2)
  })
})
