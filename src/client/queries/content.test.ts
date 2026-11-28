import { describe, expect, it } from 'vitest'

import { collectionQueryOptions, mediaQueryOptions } from './content'
import { queryTimes } from './keys'

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
