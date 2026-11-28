import { describe, expect, it } from 'vitest'
import { normalizeConfiguration } from '#/shared/configuration'
import { configurationNameIssues } from '#/shared/configuration-names'

describe('configuration identities during normalization', () => {
  it('rejects duplicates regardless of order', () => {
    const entries = [
      { name: 'posts', type: 'collection', path: 'posts' },
      { name: 'posts', type: 'file', path: 'settings.yml' },
    ]
    for (const content of [entries, [...entries].reverse()]) {
      expect(() => normalizeConfiguration({ content })).toThrow(
        'Duplicate content name',
      )
    }
  })
  it('reports every occurrence and leaves input intact', () => {
    const config = {
      media: Array.from({ length: 3 }, () => ({
        name: 'images',
        input: 'images',
      })),
    }
    const original = structuredClone(config)
    expect(configurationNameIssues(config)).toHaveLength(3)
    expect(() => normalizeConfiguration(config)).toThrow('Duplicate media name')
    expect(config).toEqual(original)
  })
})
