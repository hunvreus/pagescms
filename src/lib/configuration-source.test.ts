import { describe, expect, it } from 'vitest'

import { parseConfigurationSource } from './configuration-source'

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
})
