import { describe, expect, it, vi } from 'vitest'
import YAML from 'yaml'

import {
  parseConfigurationSource,
  validateConfigurationSource,
} from './configuration-source'

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

  it('returns source diagnostics and the recoverable value for invalid YAML', () => {
    const result = parseConfigurationSource('content: [\n')

    expect(result.configuration).toEqual({ content: [] })
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        code: 'BAD_INDENT',
        from: 11,
        to: 12,
      }),
    ])
  })

  it('reports duplicate keys while matching YAML last-value recovery', () => {
    const result = parseConfigurationSource('cache: true\ncache: false\n')

    expect(result.configuration).toEqual({ cache: false })
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        code: 'DUPLICATE_KEY',
        from: 12,
        to: 13,
      }),
    ])
  })

  it('reports multiple YAML documents and reads only the first', () => {
    const result = parseConfigurationSource('---\na: 1\n---\nb: 2\n')

    expect(result.configuration).toEqual({ a: 1 })
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

  it('reports alias expansion limits as diagnostics rather than throwing', () => {
    const source =
      'media: &images images\ncontent: [' +
      Array(101).fill('*images').join(', ') +
      ']\n'
    const result = parseConfigurationSource(source)
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        code: 'YAML_CONVERSION_ERROR',
        message: expect.stringContaining('alias count'),
      }),
    )
  })
})

describe('validateConfigurationSource', () => {
  it('parses YAML only once per validation', () => {
    const parse = vi.spyOn(YAML, 'parseDocument')
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
