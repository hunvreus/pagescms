import { describe, expect, it } from 'vitest'

import { parseProfileRequest } from './account'

describe('account requests', () => {
  it('normalizes profile names and enforces their bounds', () => {
    expect(parseProfileRequest({ name: '  Ada Lovelace  ' })).toEqual({
      name: 'Ada Lovelace',
    })
    expect(() => parseProfileRequest({ name: '   ' })).toThrow(
      'between 1 and 120',
    )
    expect(() => parseProfileRequest({ name: 'a'.repeat(121) })).toThrow(
      'between 1 and 120',
    )
  })
})
