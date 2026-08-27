import { describe, expect, it } from 'vitest'

import { MEDIA_UPLOAD_LIMIT, validateMediaUpload } from './media-upload'

describe('validateMediaUpload', () => {
  it('matches file extensions case-insensitively', () => {
    expect(() =>
      validateMediaUpload({ name: 'Photo.JPG', size: 10 }, ['jpg']),
    ).not.toThrow()
  })

  it('rejects disallowed extensions', () => {
    expect(() =>
      validateMediaUpload({ name: 'document.pdf', size: 10 }, ['jpg']),
    ).toThrow('document.pdf uses a disallowed file extension')
  })

  it('rejects files above the upload limit', () => {
    expect(() =>
      validateMediaUpload({
        name: 'large.jpg',
        size: MEDIA_UPLOAD_LIMIT + 1,
      }),
    ).toThrow('large.jpg exceeds the 20 MB limit')
  })
})
