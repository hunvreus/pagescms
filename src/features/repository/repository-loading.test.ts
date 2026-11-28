import { describe, expect, it } from 'vitest'

import { repositoryPendingContent } from './repository-loading'

describe('repositoryPendingContent', () => {
  it('does not interpret standalone or team paths as repository pages', () => {
    for (const path of ['/oauth/consent/extra', '/teams/acme/source/repo'])
      expect(repositoryPendingContent(path)).toBe('generic')
  })
  it.each(['/github/pagescms/fixture/main', '/github/pagescms/fixture/main/'])(
    'uses the overview skeleton for %s',
    (pathname) => {
      expect(repositoryPendingContent(pathname)).toBe('overview')
    },
  )

  it('uses the collection skeleton for a collection index route', () => {
    expect(
      repositoryPendingContent(
        '/github/hunvreus/hunvreus.github.io/master/collection/posts',
      ),
    ).toBe('collection')
  })

  it('does not flash the collection table for an entry editor', () => {
    expect(
      repositoryPendingContent(
        '/github/hunvreus/hunvreus.github.io/master/collection/posts/entry/src/posts/example.md',
      ),
    ).toBe('generic')
  })
})
