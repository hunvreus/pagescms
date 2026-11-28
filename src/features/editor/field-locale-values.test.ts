import { expect, it } from 'vitest'
import {
  canCopyFieldLocale,
  copyFieldLocale,
  fieldLocaleValues,
  relativeLocaleFieldPath,
} from './field-locale-values'

it('copies one inherited field, retaining other fields and source languages', () => {
  const content = {
    en: { seo: { title: 'Hello', description: 'Keep me' }, count: 0 },
    fr: {
      seo: { title: 'Bonjour', description: 'French description' },
      count: 1,
    },
  }
  expect(copyFieldLocale(content, 'fr', 'en', ['seo', 'title'])).toEqual({
    ...content,
    en: { seo: { title: 'Bonjour', description: 'Keep me' }, count: 0 },
  })
  expect(content.en.seo.title).toBe('Hello')
  expect(
    fieldLocaleValues({ en: { flag: false }, fr: { flag: null }, ja: {} }, [
      'flag',
    ]),
  ).toEqual({ en: false, fr: null })
})
it('can start a missing field or object without inventing list item matches', () => {
  const content = {
    en: { seo: { title: 'Hello' }, items: [{ title: 'Unrelated item' }] },
    fr: {},
  }
  expect(copyFieldLocale(content, 'en', 'fr', ['seo', 'title'])).toEqual({
    ...content,
    fr: { seo: { title: 'Hello' } },
  })
  expect(fieldLocaleValues(content, ['items', '0', 'title'])).toEqual({})
  expect(copyFieldLocale(content, 'en', 'fr', ['items', '0', 'title'])).toBe(
    content,
  )
  expect(copyFieldLocale(content, 'en', 'fr', ['items'])).toEqual({
    ...content,
    fr: { items: [{ title: 'Unrelated item' }] },
  })
})
it('keeps malformed destination containers intact and allows copying a whole locale boundary', () => {
  const content = {
    en: { seo: 'Retain this' },
    fr: { seo: { title: 'Bonjour' } },
  }
  expect(canCopyFieldLocale(content, 'en', ['seo', 'title'])).toBe(false)
  expect(copyFieldLocale(content, 'fr', 'en', ['seo', 'title'])).toBe(content)
  expect(copyFieldLocale(content, 'fr', 'en', [])).toEqual({
    en: content.fr,
    fr: content.fr,
  })
  expect(
    relativeLocaleFieldPath('translations.en', 'translations.en.seo.title'),
  ).toEqual(['seo', 'title'])
  expect(
    relativeLocaleFieldPath('translations.en', 'shared.title'),
  ).toBeUndefined()
})
it('treats prototype-like field names as own data properties', () => {
  const content = JSON.parse(
    '{"en":{},"fr":{"constructor":{"title":"Bonjour"}}}',
  )
  const result = copyFieldLocale(content, 'fr', 'en', ['constructor', 'title'])
  expect(result).toEqual({
    en: { constructor: { title: 'Bonjour' } },
    fr: { constructor: { title: 'Bonjour' } },
  })
  expect(Object.getPrototypeOf(result)).toBe(Object.prototype)
})
