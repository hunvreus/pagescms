import { describe, expect, it } from 'vitest'
import { isLocale, preferredLocale } from './locale'
import { parseLanguageUpdate } from '#/shared/requests/ui-language'

describe('UI language negotiation', () => {
  it('accepts only enabled languages and requires an account for persistence', () => {
    expect(isLocale('fr')).toBe(true)
    expect(isLocale('fr-FR')).toBe(false)
    expect(parseLanguageUpdate({ accountId: 'one', language: 'fr' })).toEqual({
      accountId: 'one',
      language: 'fr',
    })
    for (const value of [
      null,
      [],
      {},
      { accountId: '', language: 'fr' },
      { accountId: 'one', language: 'de' },
    ])
      expect(() => parseLanguageUpdate(value)).toThrow()
  })
})

it('negotiates supported languages without mapping traditional Chinese to simplified Chinese', () => {
  expect(preferredLocale(undefined, undefined, 'es-MX,es;q=0.9')).toBe('es')
  expect(preferredLocale(undefined, undefined, 'pt-BR')).toBe('pt-BR')
  expect(preferredLocale(undefined, undefined, 'zh-Hans-CN')).toBe('zh-CN')
  expect(preferredLocale(undefined, undefined, 'zh-TW,en;q=0.8')).toBe('en')
  expect(preferredLocale('pt-BR', undefined, 'es')).toBe('pt-BR')
})
