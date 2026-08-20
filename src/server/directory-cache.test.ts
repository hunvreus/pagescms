import { describe, expect, it } from 'vitest'

import { isDirectoryCacheFresh } from './directory-cache.server'

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
})
