import { describe, expect, it } from 'vitest'

import {
  collectionQueryOptions,
  mediaDeliveryBatches,
  mediaDeliveryQueryOptions,
  mediaQueryOptions,
} from './content'
import { queryTimes } from './keys'

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

  it('bounds delivery batches without duplicating paths', () => {
    expect(mediaDeliveryBatches(['c', 'a', 'b', 'a', 'd'], 2)).toEqual([
      ['c', 'a'],
      ['b', 'd'],
    ])
    expect(mediaDeliveryBatches([], 2)).toEqual([])
    expect(() => mediaDeliveryBatches(['a'], 0)).toThrow(
      'Media delivery batch size must be a positive integer',
    )
  })
})

const coordinates = {
  owner: 'pagescms',
  repo: 'test',
  branch: 'main',
  name: 'posts',
}

describe('content query caching', () => {
  it('keeps visited collection and media folders fresh for navigation', () => {
    expect(collectionQueryOptions(coordinates).staleTime).toBe(
      queryTimes.directory,
    )
    expect(mediaQueryOptions(coordinates).staleTime).toBe(queryTimes.directory)
  })
})
