import { describe, expect, it } from 'vitest'

import { base64ByteLength } from './base64'

describe('base64ByteLength', () => {
  it('calculates decoded bytes without allocating the payload', () => {
    expect(base64ByteLength('dGVzdA==')).toBe(4)
    expect(base64ByteLength('YWJj')).toBe(3)
  })

  it.each(['', 'abc', '***=', 'abcd==='])(
    'rejects invalid base64 %s',
    (value) => {
      expect(() => base64ByteLength(value)).toThrow('Invalid base64')
    },
  )
})
