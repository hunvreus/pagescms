import { describe, expect, it } from 'vitest'

import { parseAdminSearch, parseAdminAction } from './admin'

describe('admin requests', () => {
  it('validates cache scopes and session targets', () => {
    expect(
      parseAdminAction({ action: 'reset-cache', target: 'content' }),
    ).toEqual({ action: 'reset-cache', target: 'content', userId: null })
    expect(() =>
      parseAdminAction({ action: 'reset-cache', target: 'users' }),
    ).toThrow('cache target')
    expect(() => parseAdminAction({ action: 'revoke-user' })).toThrow('user id')
  })
  it('normalizes search input and rejects invalid pages', () => {
    expect(parseAdminSearch({ query: '  ada ', page: 2 })).toEqual({
      query: 'ada',
      page: 2,
      repoQuery: '',
      repoPage: 1,
    })
    expect(parseAdminSearch(undefined)).toEqual({
      query: '',
      page: 1,
      repoQuery: '',
      repoPage: 1,
    })
    expect(() => parseAdminSearch({ page: 0 })).toThrow('page')
    expect(
      parseAdminSearch({ repoQuery: ' owner/repo ', repoPage: 3 }),
    ).toEqual({ query: '', page: 1, repoQuery: 'owner/repo', repoPage: 3 })
    expect(() => parseAdminSearch({ repoPage: 0 })).toThrow('page')
  })
})
