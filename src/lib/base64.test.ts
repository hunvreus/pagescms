import { afterEach, describe, expect, it, vi } from 'vitest'

import { base64ByteLength, decodeBase64Utf8, encodeBase64Utf8 } from './base64'

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

describe.each(['native', 'web fallback'])(
  '%s UTF-8 base64 conversion',
  (runtime) => {
    afterEach(() => vi.unstubAllGlobals())

    it('preserves Unicode, invalid UTF-8, and forgiving base64 rules', () => {
      if (runtime === 'web fallback') vi.stubGlobal('Buffer', undefined)
      for (const text of ['', 'café 📚', 'x'.repeat(256 * 1024)]) {
        expect(decodeBase64Utf8(encodeBase64Utf8(text))).toBe(text)
      }
      expect(encodeBase64Utf8('café 📚')).toBe('Y2Fmw6kg8J+Tmg==')
      expect(decodeBase64Utf8(' YQ\n\u00a0')).toBe('a')
      expect(decodeBase64Utf8('77u/YQ==')).toBe('a')
      expect(decodeBase64Utf8('/w==')).toBe('\uFFFD')
      for (const invalid of ['A', 'YQ=', 'YQ===', 'Y-Q=', 'YWJj!']) {
        expect(() => decodeBase64Utf8(invalid)).toThrow()
      }
    })
  },
)
