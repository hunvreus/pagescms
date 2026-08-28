import { describe, expect, it } from 'vitest'

import {
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
