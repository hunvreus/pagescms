import { describe, expect, it } from 'vitest'

import {
  generateContentFilename,
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

  it('normalizes unsafe slug characters', () => {
    expect(slugifyFilenameValue('../../ Café & Tea')).toBe('cafe-tea')
  })
})
