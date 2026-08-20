import { describe, expect, it } from 'vitest'

import {
  parseContent,
  serializeContent,
  setFrontmatterDelimiters,
} from './content-serialization'

describe('parseContent', () => {
  it.each([
    ['yaml', 'title: Hello\npublished: true\n'],
    ['json', '{"title":"Hello","published":true}'],
    ['toml', 'title = "Hello"\npublished = true\n'],
  ] as const)('parses %s documents', (format, source) => {
    expect(parseContent(source, { format })).toEqual({
      title: 'Hello',
      published: true,
    })
  })

  it('returns an empty object for empty serialized documents', () => {
    expect(parseContent('', { format: 'yaml' })).toEqual({})
    expect(parseContent('  ', { format: 'json' })).toEqual({})
    expect(parseContent('\n', { format: 'toml' })).toEqual({})
  })

  it('parses default YAML frontmatter and preserves the body', () => {
    expect(parseContent('---\ntitle: Hello\n---\n# Heading\n\nBody\n')).toEqual(
      { title: 'Hello', body: '# Heading\n\nBody\n' },
    )
  })

  it('returns the whole source as body when delimiters are absent', () => {
    expect(parseContent('# Heading\n')).toEqual({ body: '# Heading\n' })
  })

  it('parses JSON frontmatter even when the body contains braces', () => {
    expect(
      parseContent('{\n  "title": "Hello"\n}\nBody with {braces}.', {
        format: 'json-frontmatter',
      }),
    ).toEqual({ title: 'Hello', body: 'Body with {braces}.' })
  })

  it('supports paired custom delimiters and CRLF input', () => {
    expect(
      parseContent('<!--meta-->\r\ntitle: Hello\r\n<!--/meta-->\r\nBody', {
        format: 'yaml-frontmatter',
        delimiters: ['<!--meta-->', '<!--/meta-->'],
      }),
    ).toEqual({ title: 'Hello', body: 'Body' })
  })
})

describe('serializeContent', () => {
  it.each(['yaml', 'json', 'toml'] as const)(
    'round-trips %s documents',
    (format) => {
      const value = { title: 'Hello', published: true, count: 2 }
      expect(
        parseContent(serializeContent(value, { format }), { format }),
      ).toEqual(value)
    },
  )

  it('writes YAML frontmatter without mutating content', () => {
    const value = { title: 'Hello', body: '# Heading\n' }

    expect(serializeContent(value)).toBe('---\ntitle: Hello\n---\n# Heading\n')
    expect(value).toEqual({ title: 'Hello', body: '# Heading\n' })
  })

  it('writes default JSON frontmatter without extra delimiters', () => {
    expect(
      serializeContent(
        { title: 'Hello', body: 'Body' },
        { format: 'json-frontmatter' },
      ),
    ).toBe('{\n  "title": "Hello"\n}\nBody')
  })

  it('emits delimiters for body-only frontmatter documents', () => {
    expect(serializeContent({ body: 'Body' })).toBe('---\n---\nBody')
  })
})

describe('setFrontmatterDelimiters', () => {
  it('selects format defaults and validates custom pairs', () => {
    expect(setFrontmatterDelimiters(undefined, 'yaml-frontmatter')).toEqual([
      '---',
      '---',
    ])
    expect(setFrontmatterDelimiters(undefined, 'toml-frontmatter')).toEqual([
      '+++',
      '+++',
    ])
    expect(setFrontmatterDelimiters('~~~', 'yaml-frontmatter')).toEqual([
      '~~~',
      '~~~',
    ])
    expect(() =>
      setFrontmatterDelimiters(['only-one'], 'yaml-frontmatter'),
    ).toThrow('two strings')
  })
})
