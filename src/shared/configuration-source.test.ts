import { describe, expect, it, vi } from 'vitest'
import * as YAML from 'js-yaml'
import { z } from 'zod'

import {
  parseConfigurationSource,
  validateConfigurationSource,
} from '#/shared/configuration-source'

vi.mock('js-yaml', async (importOriginal) => {
  const original = await importOriginal<typeof YAML>()
  return { ...original, parseEvents: vi.fn(original.parseEvents) }
})

describe('parseConfigurationSource', () => {
  it('parses Pages CMS YAML into plain data', () => {
    const result = parseConfigurationSource(`
media: images
settings:
  cache: true
content:
  - name: posts
    type: collection
    path: content/posts
`)

    expect(result.configuration).toEqual({
      media: 'images',
      settings: { cache: true },
      content: [{ name: 'posts', type: 'collection', path: 'content/posts' }],
    })
    expect(result.diagnostics).toEqual([])
  })

  it('normalizes an empty document to an empty configuration', () => {
    expect(parseConfigurationSource('')).toEqual({
      configuration: {},
      diagnostics: [],
    })
  })

  it('retains the legacy relaxed YAML parsing mode', () => {
    const result = parseConfigurationSource(`
defaults: &defaults
  type: string
field:
  <<: *defaults
`)

    expect(result.configuration).toEqual({
      defaults: { type: 'string' },
      field: { '<<': { type: 'string' } },
    })
    expect(result.diagnostics).toEqual([])
  })

  it('returns the first syntax diagnostic and an empty configuration', () => {
    const result = parseConfigurationSource('content: [\n')

    expect(result.configuration).toEqual({})
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        code: 'BAD_INDENT',
        from: 11,
        to: 12,
      }),
    ])
  })

  it('returns only the first syntax error even when the source contains more', () => {
    const result = validateConfigurationSource('one: [\ntwo: [\n')
    expect(result.configuration).toEqual({})
    expect(result.diagnostics).toHaveLength(1)
    expect(result.diagnostics[0]).toMatchObject({
      severity: 'error',
      from: expect.any(Number),
    })
  })

  it('reports independent alias and schema diagnostics together', () => {
    const result = validateConfigurationSource(
      'media: *missing\nsettings:\n  cache: wrong\nextra: true\ncontent:\n  - name: posts\n    type: collection\n    path: posts\n  - name: posts\n    type: file\n    path: settings.yml\n',
    )
    expect(result.diagnostics.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        'UNRESOLVED_ALIAS',
        'invalid_type',
        'unrecognized_keys',
      ]),
    )
    expect(
      result.diagnostics.filter(({ message }) =>
        message.includes('Duplicate content name'),
      ),
    ).toHaveLength(2)
  })

  it('reports duplicate keys', () => {
    const result = parseConfigurationSource('cache: true\ncache: false\n')

    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        code: 'DUPLICATE_KEY',
        from: 12,
        to: 13,
      }),
    ])
  })

  it('reports multiple YAML documents', () => {
    const result = parseConfigurationSource('---\na: 1\n---\nb: 2\n')

    expect(result.diagnostics[0]).toEqual(
      expect.objectContaining({ code: 'MULTIPLE_DOCS', from: 9, to: 18 }),
    )
  })

  it('reports unresolved aliases at the alias without throwing', () => {
    const source = 'media: *missing\n'
    const result = parseConfigurationSource(source)
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        code: 'UNRESOLVED_ALIAS',
        from: 7,
        to: 15,
      }),
    )
    expect(validateConfigurationSource(source).diagnostics).toEqual(
      result.diagnostics,
    )
  })

  it('rejects cyclic aliases rather than overflowing schema validation', () => {
    const result = validateConfigurationSource('content: &items\n  - *items\n')
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        code: 'CYCLIC_ALIAS',
        from: 20,
        to: 26,
      }),
    )
  })

  it('keeps valid aliases working', () => {
    const result = parseConfigurationSource(
      'media: &images images\nother: *images\n',
    )
    expect(result.configuration).toEqual({ media: 'images', other: 'images' })
    expect(result.diagnostics).toEqual([])
  })

  it('accepts repeated references to a large ordinary list', () => {
    const source = `fields: &fields [${Array.from({ length: 30 }, (_, i) => `field${i}`).join(', ')}]\nreferences: [${Array(15).fill('*fields').join(', ')}]\n`
    expect(parseConfigurationSource(source).diagnostics).toEqual([])
  })

  it('accepts many independent scalar aliases', () => {
    const source = Array.from(
      { length: 101 },
      (_, i) => `a${i}: &a${i} x\nb${i}: *a${i}`,
    ).join('\n')
    expect(parseConfigurationSource(source).diagnostics).toEqual([])
  })

  it('rejects nested alias expansion before validation', () => {
    const result = validateConfigurationSource(
      'a: &a [one, two, three, four, five]\nb: &b [*a, *a, *a, *a, *a]\nc: &c [*b, *b, *b, *b, *b]\ncontent: [*c, *c, *c, *c, *c]\n',
    )
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'YAML_CONVERSION_ERROR',
        message: expect.stringContaining('alias count'),
      }),
    )
  })

  it('accepts repeated scalar aliases without expanding object graphs', () => {
    const source =
      'media: &images images\ncontent: [' +
      Array(101).fill('*images').join(', ') +
      ']\n'
    expect(parseConfigurationSource(source).diagnostics).toEqual([])
  })
})

describe('validateConfigurationSource', () => {
  it('parses YAML only once per validation', () => {
    const parse = vi.spyOn(YAML, 'parseEvents')
    parse.mockClear()
    try {
      validateConfigurationSource('media: images\n')
      expect(parse).toHaveBeenCalledTimes(1)
    } finally {
      parse.mockRestore()
    }
  })

  it('preserves nested field messages and ranges alongside warnings', () => {
    const source =
      'content:\n  - name: posts\n    type: collection\n    path: posts\n    fields:\n      - name: title\n        type: string\n        required: nope\n        extra: true\n'
    const result = validateConfigurationSource(source)
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        from: source.indexOf('nope'),
        message: "'required' must be a boolean.",
      }),
    )
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'warning',
        from: source.indexOf('extra'),
        message: "Property 'extra' isn't valid and will be ignored.",
      }),
    )
  })
  it('reports configuration schema errors at the related YAML node', () => {
    const result = validateConfigurationSource('content: nope\n')

    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        from: 9,
        message: expect.stringContaining('array'),
      }),
    ])
  })

  it('reports unknown top-level keys as warnings', () => {
    const result = validateConfigurationSource('surprise: true\n')

    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'warning',
        from: 0,
        to: 8,
        message: "Property 'surprise' isn't valid and will be ignored.",
      }),
    ])
  })

  it('underlines each unknown property rather than the whole mapping', () => {
    const source = 'settings:\n  surprise: true\n  another: false\n'
    const result = validateConfigurationSource(source)
    expect(
      result.diagnostics.map(({ from, to, message, severity }) => ({
        text: source.slice(from!, to!),
        message,
        severity,
      })),
    ).toEqual([
      {
        text: 'surprise',
        message: "Property 'surprise' isn't valid and will be ignored.",
        severity: 'warning',
      },
      {
        text: 'another',
        message: "Property 'another' isn't valid and will be ignored.",
        severity: 'warning',
      },
    ])
  })

  it('expands union errors into the nested custom field messages', () => {
    const source = 'media:\n  input: 123\n  output: images\n'
    const result = validateConfigurationSource(source)
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        from: source.indexOf('123'),
        message: "'input' is required.",
      }),
    )
    expect(
      result.diagnostics.some(({ message }) => message === 'Invalid input'),
    ).toBe(false)
  })
})

describe('Zod 4 diagnostics', () => {
  it('keeps nested union paths relative to their parent and reports root mismatches', () => {
    const schema = z.object({
      outer: z.object({
        value: z.union([
          z.object({
            nested: z.union([z.string(), z.object({ enabled: z.boolean() })]),
          }),
          z.boolean(),
        ]),
      }),
    })
    const source = 'outer:\n  value:\n    nested:\n      enabled: nope\n'
    expect(
      validateConfigurationSource(source, schema).diagnostics,
    ).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        from: source.indexOf('nope'),
        message: expect.stringContaining('boolean'),
      }),
    )
  })

  it('reports invalid discriminators even when no union branch matches', () => {
    const schema = z.object({
      choice: z.discriminatedUnion('type', [
        z.object({ type: z.literal('file') }),
        z.object({ type: z.literal('folder') }),
      ]),
    })
    const source = 'choice:\n  type: nope\n'
    expect(
      validateConfigurationSource(source, schema).diagnostics,
    ).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        from: source.indexOf('nope'),
      }),
    )
  })
})

describe('resource identities', () => {
  it('marks both duplicate content names across nested groups', () => {
    const source = `content:
  - name: posts
    type: collection
    path: posts
  - name: group
    type: group
    items:
      - name: posts
        type: file
        path: settings.yml
`
    const errors = validateConfigurationSource(source).diagnostics.filter(
      (issue) => issue.severity === 'error',
    )
    expect(errors).toHaveLength(2)
    expect(
      errors.every((issue) => issue.message.includes('Duplicate content name')),
    ).toBe(true)
    expect(new Set(errors.map((issue) => issue.from)).size).toBe(2)
  })

  it('checks media separately and permits shared group names', () => {
    const valid = `content:
  - name: media
    type: collection
    path: posts
  - name: media
    type: group
    items: []
media:
  - name: media
    input: images
    output: /images
`
    expect(validateConfigurationSource(valid).diagnostics).toEqual([])
    const errors = validateConfigurationSource(
      `${valid}  - name: media\n    input: other\n    output: /other\n`,
    ).diagnostics
    expect(errors).toHaveLength(2)
    expect(
      errors.every(
        (issue) =>
          issue.severity === 'error' &&
          issue.message.includes('Duplicate media name'),
      ),
    ).toBe(true)
  })
})

it('reports duplicate identities even alongside unknown properties', () => {
  const { diagnostics } = validateConfigurationSource(`unknown: true
content:
  - name: posts
    type: collection
    path: posts
  - name: posts
    type: file
    path: settings.yml
`)
  expect(
    diagnostics.filter((issue) => issue.severity === 'error'),
  ).toHaveLength(2)
  expect(diagnostics.some((issue) => issue.severity === 'warning')).toBe(true)
})
