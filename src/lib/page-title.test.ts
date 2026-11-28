import { describe, expect, it } from 'vitest'
import { pageTitle } from './page-title'

describe('page titles', () => {
  it('names standalone pages', () => {
    expect(pageTitle('Settings').meta[0].title).toBe('Settings | Pages CMS')
  })
  it('distinguishes repositories and branches without double decoding names', () => {
    expect(
      pageTitle('Posts', {
        owner: 'pagescms',
        repo: 'Test',
        branch: 'feature/posts',
      }).meta[0].title,
    ).toBe('Posts - pagescms/Test@feature/posts | Pages CMS')
    expect(
      pageTitle('Repository', { owner: 'pagescms', repo: 'Test' }).meta[0]
        .title,
    ).toBe('Repository - pagescms/Test | Pages CMS')
    expect(pageTitle('Edit content/100% ready.md').meta[0].title).toContain(
      '100% ready.md',
    )
  })
})
