import { describe, expect, it } from 'vitest'

import {
  generateContentFilename,
  getContentPrimaryField,
  slugifyFilenameValue,
} from './content-filename'

describe('content filenames', () => {
  it('generates dated filenames from the configured primary field', () => {
    expect(
      generateContentFilename(
        '{year}-{month}-{day}-{primary}.md',
        { fields: [{ name: 'title', type: 'string' }] },
        { title: 'Hello, Wörld!' },
        new Date('2026-08-20T12:34:56Z'),
      ),
    ).toBe('2026-08-20-hello-world.md')
  })

  it('supports nested explicit fields and slug aliases', () => {
    expect(
      generateContentFilename(
        '{fields.seo.title}-{slug}.json',
        {
          view: { primary: 'title' },
          fields: [{ name: 'title', type: 'string' }],
        },
        { title: 'Page', seo: { title: 'Search title' } },
      ),
    ).toBe('search-title-page.json')
  })

  it('keeps user values in their template segment and uses UTC for date folders', () => {
    const fields = { title: 'News / Updates' }
    const schema = { view: { primary: 'title' } }
    expect(generateContentFilename('{primary}/_index.md', schema, fields)).toBe(
      'news-updates/_index.md',
    )
    expect(
      generateContentFilename(
        '{year}/{month}/{primary}.md',
        schema,
        fields,
        new Date('2026-12-01T00:30:00+02:00'),
      ),
    ).toBe('2026/11/news-updates.md')
  })

  it.each([
    '',
    '/absolute.md',
    'end/',
    './post.md',
    'a/../post.md',
    'a//b.md',
    'C:/post.md',
    'a\\b.md',
    '{primary}/_index.md',
    'a/{missing}/post.md',
    'a/\u0000.md',
  ])('rejects an invalid generated path %j', (pattern) => {
    expect(() =>
      generateContentFilename(pattern, { view: { primary: 'title' } }, {}),
    ).toThrow('relative path')
  })

  it('rejects template subfolders in a flat collection', () => {
    expect(() =>
      generateContentFilename('{year}/post.md', { subfolders: false }, {}),
    ).toThrow('does not allow subfolders')
  })

  it('normalizes unsafe slug characters', () => {
    expect(slugifyFilenameValue('../../ Café & Tea')).toBe('cafe-tea')
  })
})

describe('primary field selection', () => {
  it('prefers title, name, then label regardless of field order', () => {
    const fields = ['other', 'label', 'name', 'title'].map((name) => ({
      name,
      type: 'string',
    }))
    expect(getContentPrimaryField({ fields })).toBe('title')
    expect(getContentPrimaryField({ fields: fields.slice(0, 3) })).toBe('name')
    expect(getContentPrimaryField({ fields: fields.slice(0, 2) })).toBe('label')
    expect(getContentPrimaryField({ fields: fields.slice(0, 1) })).toBe('other')
  })
  it('respects explicit primary fields, including image columns', () => {
    expect(
      getContentPrimaryField({
        view: { primary: 'cover' },
        fields: [{ name: 'title', type: 'string' }],
      }),
    ).toBe('cover')
  })
  it('skips media, booleans and lists and resolves nested scalar fields', () => {
    expect(
      getContentPrimaryField({
        fields: [
          { name: 'title', type: 'image' },
          { name: 'name', type: 'string', list: true },
          {
            name: 'items',
            type: 'object',
            list: true,
            fields: [{ name: 'title', type: 'string' }],
          },
          { name: 'published', type: 'boolean' },
          {
            name: 'meta',
            type: 'object',
            fields: [{ name: 'label', type: 'string' }],
          },
        ],
      }),
    ).toBe('meta.label')
    expect(
      getContentPrimaryField({ fields: [{ name: 'cover', type: 'image' }] }),
    ).toBeUndefined()
  })
})
