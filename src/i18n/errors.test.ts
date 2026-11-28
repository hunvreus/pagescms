import { expect, it } from 'vitest'
import { setupI18n } from '@lingui/core'
import { localizeErrorMessage, registerErrorTranslations } from './errors'

it('localizes only registered diagnostics, with per-instance isolation', () => {
  const french = setupI18n({
    locale: 'fr',
    messages: { fr: { known: 'Une erreur est survenue' } },
  })
  const english = setupI18n({
    locale: 'en',
    messages: { en: { known: 'Something went wrong' } },
  })
  const entries = [{ source: 'Something went wrong', message: { id: 'known' } }]
  registerErrorTranslations(french, entries)
  registerErrorTranslations(english, entries)
  expect(
    localizeErrorMessage(new Proxy(french, {}), 'Something went wrong'),
  ).toBe('Une erreur est survenue')
  expect(localizeErrorMessage(english, 'Something went wrong')).toBe(
    'Something went wrong',
  )
  expect(localizeErrorMessage(french, 'Provider returned 403')).toBe(
    'Provider returned 403',
  )
  expect(localizeErrorMessage(french, 'known')).toBe('known')
})
it('matches known validation templates and preserves field paths as data', () => {
  const i18n = setupI18n({
    locale: 'fr',
    messages: { fr: { required: ['Le champ ', ['path'], ' est obligatoire'] } },
  })
  registerErrorTranslations(i18n, [
    {
      source: '{path} is required',
      message: { id: 'required' },
      pattern: /^(.+) is required$/,
      values: ['path'],
    },
  ])
  expect(localizeErrorMessage(i18n, 'author.name is required')).toBe(
    'Le champ author.name est obligatoire',
  )
  expect(localizeErrorMessage(i18n, 'author.name is required extra')).toBe(
    'author.name is required extra',
  )
})

it('prefers exact errors, then the most specific matching pattern', () => {
  const i18n = setupI18n({
    locale: 'fr',
    messages: {
      fr: { exact: 'exact', specific: 'specific', general: 'general' },
    },
  })
  registerErrorTranslations(i18n, [
    {
      source: '{item} failed',
      message: { id: 'general' },
      pattern: /^(.+) failed$/,
    },
    { source: 'Upload failed', message: { id: 'exact' } },
    {
      source: 'Upload {item} failed',
      message: { id: 'specific' },
      pattern: /^Upload (.+) failed$/,
    },
  ])
  expect(localizeErrorMessage(i18n, 'Upload failed')).toBe('exact')
  expect(localizeErrorMessage(i18n, 'Upload image failed')).toBe('specific')
  expect(localizeErrorMessage(i18n, 'Other failed')).toBe('general')
})

it('prefers specific diagnostics and safely interpolates the actual compiled catalogs', async () => {
  const [{ errors }, { messages: english }, { messages: french }] =
    await Promise.all([
      import('./known-errors'),
      import('../locales/en/messages.po'),
      import('../locales/fr/messages.po'),
    ])
  const i18n = setupI18n({
    locale: 'fr',
    messages: { en: english, fr: french },
  })
  registerErrorTranslations(i18n, errors)
  for (const message of [
    'author.name is required',
    'Content allows at most 2 items',
    'Item 2 must be an object',
    "Property 'example' isn't valid and will be ignored.",
  ]) {
    const result = localizeErrorMessage(i18n, message)
    expect(result).not.toBe(message)
    expect(result).not.toMatch(/\{value\d+\}|^Content |^Item /)
  }
  expect(localizeErrorMessage(i18n, '1 file uploaded')).toBe(
    '1 fichier importé',
  )
  expect(localizeErrorMessage(i18n, '2 files uploaded')).toBe(
    '2 fichiers importés',
  )
  i18n.activate('en')
  expect(
    localizeErrorMessage(
      i18n,
      "Property 'example' isn't valid and will be ignored.",
    ),
  ).toBe("Property 'example' isn't valid and will be ignored.")
})

it('translates workflow results, plural invitations and alias diagnostics as whole messages', async () => {
  const [{ errors }, { messages }] = await Promise.all([
    import('./known-errors'),
    import('../locales/fr/messages.po'),
  ])
  const i18n = setupI18n({ locale: 'fr', messages: { fr: messages } })
  registerErrorTranslations(i18n, errors)
  for (const message of [
    '“Build site” succeeded',
    '“Build site” timed out',
    '“Build site” is running',
    '3 invitations sent',
    '2 collaborators added',
    'Branch “feature/new” created',
    "Alias '*my-anchor' creates a circular reference.",
    "Alias '*my-anchor' must reference an earlier anchor.",
  ]) {
    const translated = localizeErrorMessage(i18n, message)
    expect(translated).not.toBe(message)
    expect(translated).not.toMatch(/\{value\d+\}/)
  }
  expect(localizeErrorMessage(i18n, '“Build site” succeeded')).toContain(
    'Build site',
  )
})
