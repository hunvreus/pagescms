import { describe, expect, it } from 'vitest'

import { mediaDeliveryQueryOptions } from './content'

describe('media delivery query', () => {
  it('keeps a stable directory key when the requested path set changes', () => {
    const media = {
      owner: 'PagesCMS',
      repo: 'Demo',
      branch: 'main',
      name: 'images',
      path: 'public/images',
    }
    const first = mediaDeliveryQueryOptions({
      ...media,
      paths: ['public/images/a.png'],
    })
    const second = mediaDeliveryQueryOptions({
      ...media,
      paths: ['public/images/a.png', 'public/images/b.png'],
    })

    expect(first.queryKey).toEqual(second.queryKey)
    expect(first.queryKey).not.toContain('public/images/a.png')
  })
})
