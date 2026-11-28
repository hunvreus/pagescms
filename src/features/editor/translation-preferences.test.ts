// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest'
import {
  clearTranslationPreferences,
  collectionLocalePreference,
  rememberTranslationPreference,
  translationPreference,
} from './translation-preferences'
import { DELETED_ACCOUNTS_KEY } from '#/features/account/local-account-storage'

beforeEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})
it('isolates remembered collection views and copy choices by account and scope', () => {
  rememberTranslationPreference('alice', 'collection:a', 'en')
  rememberTranslationPreference('alice', 'copy-on-start', 'true')
  expect(translationPreference('alice', 'collection:a')).toBe('en')
  expect(translationPreference('alice', 'collection:b')).toBeNull()
  expect(translationPreference('bob', 'collection:a')).toBeNull()
  expect(translationPreference('alice', 'copy-on-start')).toBe('true')
})
it('deletes only the removed account’s translation preferences', () => {
  rememberTranslationPreference('alice', 'collection:a', 'en')
  rememberTranslationPreference('bob', 'collection:a', 'fr')
  localStorage.setItem('unrelated', 'retained')
  clearTranslationPreferences('alice')
  expect(translationPreference('alice', 'collection:a')).toBeNull()
  expect(translationPreference('bob', 'collection:a')).toBe('fr')
  expect(localStorage.getItem('unrelated')).toBe('retained')
})
it('does not restore or write preferences belonging to a deleted account', () => {
  rememberTranslationPreference('alice', 'collection:a', 'en')
  localStorage.setItem(DELETED_ACCOUNTS_KEY, JSON.stringify(['alice']))
  expect(translationPreference('alice', 'collection:a')).toBeNull()
  rememberTranslationPreference('alice', 'collection:b', 'fr')
  expect(translationPreference('alice', 'collection:b')).toBeNull()
})
it('allows editing when browser storage is unavailable', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('Blocked')
  })
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('Blocked')
  })
  expect(translationPreference('alice', 'copy-on-start')).toBeNull()
  expect(() =>
    rememberTranslationPreference('alice', 'copy-on-start', 'true'),
  ).not.toThrow()
})

it('restores only a configured language for the collection', () => {
  const settings = { locales: [{ code: 'en' }, { code: 'fr' }] }
  expect(
    collectionLocalePreference('alice', 'collection:a', settings),
  ).toBeNull()
  rememberTranslationPreference('alice', 'collection:a', 'fr')
  expect(collectionLocalePreference('alice', 'collection:a', settings)).toBe(
    'fr',
  )
  rememberTranslationPreference('alice', 'collection:a', 'removed')
  expect(
    collectionLocalePreference('alice', 'collection:a', settings),
  ).toBeNull()
})
