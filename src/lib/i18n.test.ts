import { slugifyFilenameValue } from './content-filename'
import type { JsonObject } from '#/shared/json'
import { describe, expect, it } from 'vitest'
import {
  normalizeContentI18n,
  localizedPath,
  parseLocalizedPath,
  resolveLocales,
  assertLocalizedFields,
} from './i18n'
import {
  copyLocale,
  localizedSnapshot,
  hasLocaleData,
  preserveUnmanagedDocument,
  projectLocale,
  transformLocalizedDocument,
} from './i18n-values'

const global = {
  default: 'en',
  locales: ['en', { code: 'fr', label: 'Français' }, 'pt_BR'],
}
function schema(path: Record<string, unknown>, type = 'collection') {
  const value = {
    type,
    path: type === 'file' ? 'content/posts/about.md' : 'content/posts',
    i18n: { scheme: 'files', path },
  }
  normalizeContentI18n(value, global)
  return value
}
describe('localized repository paths', () => {
  for (const position of ['prefix', 'suffix'])
    for (const mode of ['omit', 'explicit'])
      it(`round trips filename ${position} ${mode}`, () => {
        const s = schema({
          type: 'filename',
          position,
          default: mode,
          separator: '.',
        })
        for (const locale of ['en', 'fr', 'pt_BR']) {
          const canonical = 'content/posts/guides/about.md'
          expect(
            parseLocalizedPath(s, localizedPath(s, canonical, locale)),
          ).toEqual({ canonical, locale })
        }
      })
  for (const position of ['root', 'collection', 'parent', 'custom'])
    for (const mode of ['omit', 'explicit'])
      it(`round trips folder ${position} ${mode}`, () => {
        const s = schema({
          type: 'folder',
          position,
          default: mode,
          ...(position === 'custom' ? { after: 'content' } : {}),
        })
        for (const locale of ['en', 'fr', 'pt_BR']) {
          const canonical = 'content/posts/guides/about.md'
          expect(
            parseLocalizedPath(s, localizedPath(s, canonical, locale)),
          ).toEqual({ canonical, locale })
        }
      })
  it('uses the full exact ancestor, including repeated directory names', () => {
    const s = {
      type: 'collection',
      path: 'content/content/posts',
      i18n: {
        scheme: 'files',
        path: { type: 'folder', position: 'custom', after: 'content/content' },
      },
    }
    normalizeContentI18n(s, global)
    expect(localizedPath(s, 'content/content/posts/about.md', 'fr')).toBe(
      'content/content/fr/posts/about.md',
    )
  })
  it('reserves configured locale suffixes when the default is omitted', () => {
    expect(
      parseLocalizedPath(
        schema({ type: 'filename', position: 'suffix', default: 'omit' }),
        'content/posts/about.en.md',
      ),
    ).toBeUndefined()
  })
  it('does not treat paths outside the configured collection as entries', () => {
    expect(
      parseLocalizedPath(
        schema({ type: 'folder', position: 'custom', after: 'content' }),
        'private/fr/posts/about.md',
      ),
    ).toBeUndefined()
  })
  it('fixed files identify only configured translations', () => {
    const s = schema({ type: 'folder', position: 'parent' }, 'file')
    expect(parseLocalizedPath(s, 'content/posts/fr/about.md')?.canonical).toBe(
      'content/posts/about.md',
    )
    expect(parseLocalizedPath(s, 'content/posts/fr/other.md')).toBeUndefined()
  })
})
describe('locale configuration', () => {
  it('inherits metadata, replaces membership, generates labels', () => {
    const inherited = resolveLocales(global)
    expect(
      resolveLocales({ locales: ['fr', 'de'], default: 'fr' }, inherited),
    ).toEqual({
      default: 'fr',
      locales: [
        { code: 'fr', label: 'Français' },
        { code: 'de', label: 'German' },
      ],
    })
    expect(() => resolveLocales({ locales: ['fr'] }, inherited)).toThrow(
      /default/,
    )
  })
  it('rejects nested wrappers and localized Markdown bodies', () => {
    expect(() =>
      assertLocalizedFields({
        i18n: { scheme: 'fields' },
        localized: true,
        fields: [{ name: 'title', localized: true }],
      }),
    ).toThrow(/children/)
    expect(() =>
      assertLocalizedFields({
        i18n: { scheme: 'fields' },
        format: 'yaml-frontmatter',
        localized: true,
        fields: [{ name: 'body' }],
      }),
    ).toThrow(/Markdown/)
  })
})
describe('same-file translations', () => {
  const s = {
    i18n: { scheme: 'fields', ...resolveLocales(global) },
    fields: [
      { name: 'title', type: 'string', localized: true },
      {
        name: 'rows',
        type: 'object',
        list: true,
        fields: [{ name: 'text', type: 'string', localized: true }],
      },
    ],
  }
  const data: JsonObject = {
    title: { en: 'Hello', fr: '', xx: 'unknown' },
    rows: [
      { text: { en: 'One', fr: null }, extra: 4 },
      { text: { en: 'Two' } },
    ],
    other: false,
  }
  it('projects without materializing absent translations or dropping falsy values', () => {
    expect(projectLocale(s, data, 'fr')).toEqual({
      title: '',
      rows: [{ text: null, extra: 4 }, {}],
      other: false,
    })
  })
  it('copies only absent translations and keeps independent arrays', () => {
    expect(copyLocale(s, data, 'en', 'fr')).toEqual({
      ...data,
      rows: [
        (data.rows as JsonObject[])[0],
        { text: { en: 'Two', fr: 'Two' } },
      ],
    })
    const root = { ...s, localized: true, fields: [] }
    expect(
      copyLocale(
        root,
        { en: { a: 1, b: false, rows: [1, 2] }, fr: { a: null, rows: [] } },
        'en',
        'fr',
      ),
    ).toEqual({
      en: { a: 1, b: false, rows: [1, 2] },
      fr: { a: null, b: false, rows: [] },
    })
  })
  it('transforms values rather than locale maps, retaining unknown locales', () => {
    const result = transformLocalizedDocument(s, data, (fields, value) => {
      if (Array.isArray(value)) return value
      const obj = { ...value }
      for (const field of fields as { name: string }[])
        if (typeof obj[field.name] === 'string')
          Object.assign(obj, {
            [field.name]: String(obj[field.name]).toUpperCase(),
          })
      return obj
    })
    expect(result).toEqual({
      ...data,
      title: { en: 'HELLO', fr: '', xx: 'unknown' },
      rows: [
        { text: { en: 'ONE', fr: null }, extra: 4 },
        { text: { en: 'TWO' } },
      ],
    })
  })
})

it('preserves the distinction between missing and explicit null snapshots', () => {
  const s = {
    localized: true,
    i18n: { scheme: 'fields', ...resolveLocales(global) },
  }
  expect(localizedSnapshot(s, {}, 'fr')).not.toEqual(
    localizedSnapshot(s, { fr: null }, 'fr'),
  )
})
it('does not revive fields from a previous block type', () => {
  const s = {
    fields: [
      {
        name: 'hero',
        type: 'block',
        blocks: [
          { name: 'image', fields: [{ name: 'image', type: 'image' }] },
          { name: 'quote', fields: [{ name: 'text', type: 'text' }] },
        ],
      },
    ],
  }
  expect(
    preserveUnmanagedDocument(
      s,
      { hero: { _block: 'image', image: 'old.png' } },
      { hero: { _block: 'quote', text: 'Quote' } },
    ),
  ).toEqual({ hero: { _block: 'quote', text: 'Quote' } })
})
it('removes codec-omitted locale leaves without inventing null', () => {
  const s = {
    i18n: { scheme: 'fields', ...resolveLocales(global) },
    fields: [{ name: 'title', type: 'string', localized: true }],
  }
  expect(
    transformLocalizedDocument(s, { title: { en: 'Hello' } }, () => ({})),
  ).toEqual({ title: {} })
})
it('shared field edits do not mark every locale as changed', () => {
  const s = {
    fields: [
      { name: 'title', localized: true, type: 'string' },
      { name: 'enabled', type: 'boolean' },
    ],
  }
  expect(
    localizedSnapshot(s, { title: { en: 'Hello' }, enabled: true }, 'en'),
  ).toEqual(
    localizedSnapshot(s, { title: { en: 'Hello' }, enabled: false }, 'en'),
  )
})

it('retains unknown locale keys without assigning object prototypes', () => {
  const config = {
    i18n: { scheme: 'fields', ...resolveLocales(global) },
    localized: true,
    fields: [],
  }
  const data = JSON.parse('{"en":{},"__proto__":{"keep":true}}') as JsonObject
  const result = transformLocalizedDocument(
    config,
    data,
    (_fields, value) => value,
  )
  expect(JSON.stringify(result)).toBe(JSON.stringify(data))
  expect(Object.getPrototypeOf(result)).toBe(Object.prototype)
  expect(JSON.stringify(preserveUnmanagedDocument(config, {}, data))).toBe(
    JSON.stringify(data),
  )
})

it('preserves non-Latin letters and combining marks in generated filenames', () => {
  expect(slugifyFilenameValue('नमस्ते दुनिया')).toBe('नमस्ते-दुनिया')
  expect(slugifyFilenameValue('Crème brûlée')).toBe('creme-brulee')
})

it('offers copy sources with intentional empty locale data, without inventing missing languages', () => {
  const config = {
    fields: [
      { name: 'title', type: 'string', localized: true },
      { name: 'enabled', type: 'boolean', localized: true },
      { name: 'count', type: 'number', localized: true },
      { name: 'items', type: 'string', list: true, localized: true },
    ],
  }
  const content = {
    title: { en: '', fr: null },
    enabled: { ar: false },
    count: { ja: 0 },
    items: { de: [] },
  }
  for (const code of ['en', 'fr', 'ar', 'ja', 'de'])
    expect(hasLocaleData(config, content, code)).toBe(true)
  expect(hasLocaleData(config, content, 'es')).toBe(false)
  expect(hasLocaleData({ localized: true }, { en: {} }, 'en')).toBe(true)
})
