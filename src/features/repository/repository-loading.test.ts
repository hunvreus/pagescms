import { describe, expect, it } from 'vitest'

import { repositoryPendingContent } from './repository-loading'

describe('repositoryPendingContent', () => {
  it('uses the collection skeleton for a collection index route', () => {
    expect(
      repositoryPendingContent(
        '/hunvreus/hunvreus.github.io/master/collection/posts',
      ),
    ).toBe('collection')
  })

  it('does not flash the collection table for an entry editor', () => {
    expect(
      repositoryPendingContent(
        '/hunvreus/hunvreus.github.io/master/collection/posts/entry/src/posts/example.md',
      ),
    ).toBe('generic')
  })
})
