import { describe, expect, it } from 'vitest'

import {
  mediaEntries,
  mediaLeaseRenewalDelay,
  parentMediaPath,
} from './media-model'

const entries = [
  {
    id: 'z',
    type: 'file' as const,
    name: 'z.jpg',
    path: 'media/z.jpg',
    sha: 'z',
    size: 10,
    contentType: 'image/jpeg',
  },
  {
    id: 'directory:media/Archive',
    type: 'dir' as const,
    name: 'Archive',
    path: 'media/Archive',
    sha: null,
    size: null,
    contentType: null,
  },
  {
    id: 'a',
    type: 'file' as const,
    name: 'a.pdf',
    path: 'media/a.pdf',
    sha: 'a',
    size: 30,
    contentType: null,
  },
  {
    id: 'b',
    type: 'file' as const,
    name: 'b.jpg',
    path: 'media/b.jpg',
    sha: 'b',
    size: 20,
    contentType: 'image/jpeg',
  },
]

describe('mediaEntries', () => {
  it('keeps folders first while sorting files', () => {
    expect(
      mediaEntries(entries, { sort: 'size-desc' }).map((entry) => entry.name),
    ).toEqual(['Archive', 'a.pdf', 'b.jpg', 'z.jpg'])
  })

  it('filters by search and allowed extensions', () => {
    expect(
      mediaEntries(entries, { search: 'b', extensions: ['jpg'] }).map(
        (entry) => entry.name,
      ),
    ).toEqual(['b.jpg'])
    expect(
      mediaEntries(entries, { extensions: ['jpg'] }).map((entry) => entry.name),
    ).toEqual(['Archive', 'b.jpg', 'z.jpg'])
  })
})

describe('parentMediaPath', () => {
  it('does not navigate above the configured root', () => {
    expect(parentMediaPath('media/photos', 'media')).toBe('media')
    expect(parentMediaPath('media', 'media')).toBe('media')
  })
})

describe('mediaLeaseRenewalDelay', () => {
  it('renews before the earliest expiring lease', () => {
    expect(
      mediaLeaseRenewalDelay(
        [
          { expiresAt: null },
          { expiresAt: '2026-08-28T00:02:00.000Z' },
          { expiresAt: '2026-08-28T00:01:00.000Z' },
        ],
        Date.parse('2026-08-28T00:00:00.000Z'),
      ),
    ).toBe(30_000)
  })

  it('does not schedule immutable leases and renews expired ones immediately', () => {
    expect(mediaLeaseRenewalDelay([{ expiresAt: null }])).toBeNull()
    expect(
      mediaLeaseRenewalDelay(
        [{ expiresAt: '2026-08-28T00:00:00.000Z' }],
        Date.parse('2026-08-28T00:01:00.000Z'),
      ),
    ).toBe(0)
  })
})
