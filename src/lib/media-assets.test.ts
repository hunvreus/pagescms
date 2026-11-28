import { describe, expect, it } from 'vitest'

import {
  decodeBase64Bytes,
  mediaAssetUrl,
  mediaContentType,
} from './media-assets'

describe('media assets', () => {
  it('encodes repository coordinates and paths without losing slashes', () => {
    expect(
      mediaAssetUrl({
        owner: 'Pages CMS',
        repo: 'site',
        branch: 'feature/images',
        name: 'main media',
        path: 'images/hello world.png',
      }),
    ).toBe(
      '/api/media-preview/Pages%20CMS/site/feature%2Fimages/main%20media/images/hello%20world.png',
    )
  })

  it('maps image extensions to safe content types', () => {
    expect(mediaContentType('photo.JPEG')).toBe('image/jpeg')
    expect(mediaContentType('vector.svg')).toBe('image/svg+xml')
    expect(mediaContentType('document.pdf')).toBe('application/octet-stream')
  })

  it('decodes GitHub base64 containing line breaks', () => {
    expect(new TextDecoder().decode(decodeBase64Bytes('aGVs\nbG8='))).toBe(
      'hello',
    )
  })
})
