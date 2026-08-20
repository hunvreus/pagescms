import { describe, expect, it } from 'vitest'

import { parseAdminSearch } from './admin'

describe('admin requests', () => {
  it('normalizes search input and rejects invalid pages', () => {
    expect(parseAdminSearch({ query: '  ada ', page: 2 })).toEqual({
      query: 'ada',
      page: 2,
    })
    expect(parseAdminSearch(undefined)).toEqual({ query: '', page: 1 })
    expect(() => parseAdminSearch({ page: 0 })).toThrow('page')
  })
})
