import { describe, expect, it } from 'vitest'

import { getEntryDisplayTitle } from './entry-title'

describe('getEntryDisplayTitle', () => {
  it('uses the configured primary field for an existing structured entry', () => {
    expect(
      getEntryDisplayTitle({
        content: { metadata: { title: 'Hello world' } },
        filename: 'hello.md',
        primaryField: 'metadata.title',
      }),
    ).toBe('Editing "Hello world"')
  })

  it('falls back to the filename when the primary value is empty', () => {
    expect(
      getEntryDisplayTitle({
        content: { title: '' },
        filename: 'hello.md',
        primaryField: 'title',
      }),
    ).toBe('Editing "hello.md"')
  })

  it.each([
    [{ title: 'Page content title' }, 'title'],
    [[{ title: 'Publication one' }, { title: 'Publication two' }], 'title'],
    ['raw file source', undefined],
  ])(
    'uses the fixed-file label regardless of content shape',
    (content, primaryField) => {
      expect(
        getEntryDisplayTitle({
          content,
          filename: 'publications.json',
          primaryField,
          schemaType: 'file',
          label: 'Intro',
        }),
      ).toBe('Editing "Intro"')
    },
  )

  it('uses the filename if a fixed-file label is unavailable', () => {
    expect(
      getEntryDisplayTitle({
        schemaType: 'file',
        filename: 'publications.json',
        label: '  ',
      }),
    ).toBe('Editing "publications.json"')
  })

  it('keeps collection titles tied to the entry rather than the collection label', () => {
    expect(
      getEntryDisplayTitle({
        content: { title: 'New title' },
        primaryField: 'title',
        schemaType: 'collection',
        label: 'Posts',
        filename: 'post.json',
      }),
    ).toBe('Editing "New title"')
  })

  it('labels creation without pretending a file already exists', () => {
    expect(getEntryDisplayTitle({ creating: true, filename: '' })).toBe(
      'New entry',
    )
  })
})

describe('localized entry titles', () => {
  const i18n = {
    scheme: 'fields',
    default: 'en',
    locales: [
      { code: 'en', label: 'English' },
      { code: 'fr', label: 'French' },
    ],
  }
  const base = { filename: 'post.json', primaryField: 'title' }
  it('selects the default or requested language from field maps', () => {
    const input = {
      ...base,
      schema: { i18n, fields: [{ name: 'title', localized: true }] },
      content: { title: { en: 'Hello', fr: 'Bonjour' } },
    }
    expect(getEntryDisplayTitle(input)).toBe('Editing "Hello"')
    expect(getEntryDisplayTitle({ ...input, locale: 'fr' })).toBe(
      'Editing "Bonjour"',
    )
  })
  it('projects whole-entry localization before finding nested titles', () => {
    expect(
      getEntryDisplayTitle({
        ...base,
        primaryField: 'metadata.title',
        schema: { i18n, localized: true },
        content: { en: { metadata: { title: 'Hello' } } },
      }),
    ).toBe('Editing "Hello"')
  })
  it.each([{ en: 'Hello' }, ['Hello'], null, ''])(
    'never coerces a non-title into display text',
    (title) => {
      expect(getEntryDisplayTitle({ ...base, content: { title } })).toBe(
        'Editing "post.json"',
      )
    },
  )
  it('uses the filename for a missing translation', () => {
    expect(
      getEntryDisplayTitle({
        ...base,
        schema: { i18n, fields: [{ name: 'title', localized: true }] },
        locale: 'fr',
        content: { title: { en: 'Hello' } },
      }),
    ).toBe('Editing "post.json"')
  })
})
