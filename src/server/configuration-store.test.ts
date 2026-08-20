import { describe, expect, it } from 'vitest'

import { parseConfigurationFile } from './configuration-store.server'

function encode(value: string) {
  return btoa(value)
}

describe('parseConfigurationFile', () => {
  it('decodes, normalizes, and validates repository configuration', () => {
    const configuration = parseConfigurationFile(
      encode(`
media: public/images
content:
  - name: posts
    type: collection
    path: content/posts
    fields:
      - name: title
        type: string
`),
    )

    expect(configuration).toMatchObject({
      media: [
        {
          name: 'default',
          input: 'public/images',
          output: '/public/images',
        },
      ],
      content: [
        {
          name: 'posts',
          filename: '{year}-{month}-{day}-{primary}.md',
          format: 'yaml-frontmatter',
        },
      ],
    })
  })

  it('rejects invalid YAML before caching it', () => {
    expect(() => parseConfigurationFile(encode('content: [invalid'))).toThrow()
  })
})
