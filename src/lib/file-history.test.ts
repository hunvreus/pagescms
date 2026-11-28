import { describe, expect, it } from 'vitest'
import { historyPage } from './file-history'

describe('history page validation', () => {
  it('defaults to page one and accepts positive integers', () => {
    expect(historyPage(undefined)).toBe(1)
    expect(historyPage(3)).toBe(3)
  })
  it.each([
    0,
    -1,
    1.5,
    NaN,
    Infinity,
    Number.MAX_SAFE_INTEGER + 1,
    '2',
    null,
    {},
  ])('rejects invalid pages: %s', (value) => {
    expect(() => historyPage(value)).toThrow('positive integer')
  })
})
