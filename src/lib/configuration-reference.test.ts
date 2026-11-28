import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { load } from 'js-yaml'
import {
  configurationReference,
  configurationReferenceVersion,
} from './configuration-reference.mjs'
import { ConfigurationSchema } from '#/shared/configuration-schema'
import { normalizeConfiguration } from '#/shared/configuration'

describe('bundled configuration reference', () => {
  it('matches the authored guide and the installed release', () => {
    const source = readFileSync('docs/public/reference.md', 'utf8').replace(
      /^---\s*\n[\s\S]*?\n---\s*\n?/,
      '',
    )
    expect(configurationReference).toBe(source)
    expect(configurationReferenceVersion).toBe(
      JSON.parse(readFileSync('package.json', 'utf8')).version,
    )
    expect(readFileSync('public/reference.md', 'utf8')).toBe(source)
  })
  it('validates its minimal example and documents the actual runtime defaults', () => {
    const example = configurationReference.match(/```yaml\n([\s\S]*?)```/)![1]
    const source = load(example)
    expect(ConfigurationSchema.safeParse(source).success).toBe(true)
    const entry = (
      normalizeConfiguration(source).content as Array<Record<string, unknown>>
    )[0]
    expect(entry).toMatchObject({
      filename: '{year}-{month}-{day}-{primary}.md',
      extension: 'md',
      format: 'yaml-frontmatter',
    })
    expect(configurationReference).toContain(entry.filename as string)
    const localized = normalizeConfiguration({
      i18n: { locales: ['en', 'fr'] },
      content: [
        {
          name: 'posts',
          type: 'collection',
          path: 'posts',
          i18n: {
            scheme: 'files',
            path: { type: 'filename', position: 'suffix' },
          },
          fields: [{ name: 'title', type: 'string' }],
        },
      ],
    })
    expect(
      (localized.content as Array<Record<string, unknown>>)[0].i18n,
    ).toMatchObject({
      default: 'en',
      path: { default: 'explicit', separator: '.' },
    })
    expect(configurationReference).toContain(
      '`path.default` defaults to `explicit`',
    )
  })
})
