import { describe, expect, it } from 'vitest'

import {
  parseContent,
  serializeContent,
  setFrontmatterDelimiters,
} from '#/shared/content-serialization'

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

  it('accepts many independent scalar aliases', () => {
    const source = Array.from(
      { length: 101 },
      (_, i) => `a${i}: &a${i} x\nb${i}: *a${i}`,
    ).join('\n')
    expect(parseContent(source, { format: 'yaml' })).toMatchObject({
      b100: 'x',
    })
  })

  it('rejects excessive nested YAML aliases', () => {
    const source =
      'a: &a [one, two, three, four, five]\nb: &b [*a, *a, *a, *a, *a]\nc: &c [*b, *b, *b, *b, *b]\nd: [*c, *c, *c, *c, *c]\n'
    expect(() => parseContent(source, { format: 'yaml' })).toThrow(
      'alias count',
    )
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
  it.each([
    { format: 'yaml-frontmatter' as const },
    { format: 'toml-frontmatter' as const },
    { format: 'json-frontmatter' as const },
    { format: 'json-frontmatter' as const, delimiters: ['<meta>', '</meta>'] },
  ])(
    'keeps body-only $format content stable across repeated saves',
    (options) => {
      for (const body of [
        '',
        'Body\n',
        '{"looks": "like metadata"}\nText',
        '---\nBody',
      ]) {
        const expected = { body }
        let source = serializeContent(expected, options)
        const original = source
        for (let save = 0; save < 3; save++) {
          const parsed = parseContent(source, options)
          expect(parsed).toEqual(expected)
          source = serializeContent(parsed as typeof expected, options)
          expect(source).toBe(original)
        }
      }
    },
  )

  it.each([
    'yaml-frontmatter',
    'json-frontmatter',
    'toml-frontmatter',
  ] as const)('serializes %s without mutating nested content', (format) => {
    const input = {
      metadata: { title: 'Nested', tags: ['one', 'two'] },
      body: 'Body',
    }
    Object.freeze(input.metadata.tags)
    Object.freeze(input.metadata)
    Object.freeze(input)
    const result = serializeContent(input, { format })
    expect(parseContent(result, { format })).toEqual(input)
    expect(input.body).toBe('Body')
  })

  it('reads adjacent empty delimiters with CRLF line endings', () => {
    expect(parseContent('---\r\n---\r\nBody')).toEqual({ body: 'Body' })
  })

  it.each(['yaml', 'json'] as const)(
    'round-trips root lists in %s documents',
    (format) => {
      const value = [{ title: 'First' }, { title: 'Second' }]
      expect(
        parseContent(serializeContent(value, { format }), { format }),
      ).toEqual(value)
    },
  )

  it.each(['yaml', 'json'] as const)(
    'preserves an empty root list in %s documents',
    (format) => {
      expect(
        parseContent(serializeContent([], { format }), { format }),
      ).toEqual([])
    },
  )

  it('rejects root lists in formats that cannot represent them', () => {
    expect(() => serializeContent([], { format: 'toml' })).toThrow(
      'cannot contain a list',
    )
    expect(() => serializeContent([], { format: 'yaml-frontmatter' })).toThrow(
      'must contain an object',
    )
  })

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

  it('writes an empty JSON object readable by other tools', () => {
    expect(JSON.parse(serializeContent({}, { format: 'json' }))).toEqual({})
  })

  it.each(['toml', 'toml-frontmatter'] as const)(
    'preserves temporal types and quoted strings in %s',
    (format) => {
      const header =
        'title = "Before"\ndates = [2026-11-25]\n[nested]\ntime = 12:15:10\nstamp = 2026-11-25T12:15:10+03:00\nlabel = "2026-11-25"'
      const delimiters = '~~~'
      const originalSource =
        format === 'toml'
          ? header
          : delimiters + '\n' + header + '\n' + delimiters + '\nbody'
      const values = parseContent(originalSource, {
        format,
        delimiters,
      }) as Record<string, string>
      const result = serializeContent(
        { ...values, title: 'After' },
        { format, delimiters, originalSource },
      )
      expect(result).toMatch(/dates = \[\s*2026-11-25/)
      expect(result).toContain('stamp = 2026-11-25T12:15:10')
      expect(result).toContain('time = 12:15:10')
      expect(result).toContain('label = "2026-11-25"')
    },
  )

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
