import { describe, expect, it } from 'vitest'

import { mediaEntries, parentMediaPath } from './media-model'

const entries = [
  {
    type: 'file' as const,
    name: 'z.jpg',
    path: 'media/z.jpg',
    sha: 'z',
    size: 10,
    downloadUrl: 'https://raw.example/media/z.jpg',
  },
  {
    type: 'dir' as const,
    name: 'Archive',
    path: 'media/Archive',
    sha: null,
    size: null,
    downloadUrl: null,
  },
  {
    type: 'file' as const,
    name: 'a.pdf',
    path: 'media/a.pdf',
    sha: 'a',
    size: 30,
    downloadUrl: 'https://raw.example/media/a.pdf',
  },
  {
    type: 'file' as const,
    name: 'b.jpg',
    path: 'media/b.jpg',
    sha: 'b',
    size: 20,
    downloadUrl: 'https://raw.example/media/b.jpg',
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
