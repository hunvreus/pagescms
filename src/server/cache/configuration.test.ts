import { describe, expect, it } from 'vitest'

import { createConfigurationSchema } from '#/shared/configuration-schema'
import { parseConfigurationFile } from '#/server/cache/configuration'

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

  it('decodes UTF-8 configuration with whitespace in the base64', () => {
    const source =
      'content:\n  - name: posts\n    label: Café 🐈\n    type: collection\n    path: posts\n'
    const encoded = Buffer.from(source)
      .toString('base64')
      .replace(/(.{20})/g, '$1\n')
    expect(parseConfigurationFile(encoded)).toMatchObject({
      content: [{ name: 'posts', label: 'Café 🐈' }],
    })
  })
})

it('validates plugin properties when loading a repository configuration', () => {
  const schema = createConfigurationSchema([
    {
      id: 'cloud',
      configurationSchema: {
        media: {
          storage: {
            action: 'add',
            schema: (z) => z.string().min(1).optional(),
          },
        },
      },
    },
  ])
  expect(
    parseConfigurationFile(
      encode('media:\n  input: images\n  output: /images\n  storage: assets'),
      schema,
    ),
  ).toMatchObject({ media: [{ storage: 'assets' }] })
  expect(() =>
    parseConfigurationFile(
      encode('media:\n  input: images\n  output: /images\n  storage: 42'),
      schema,
    ),
  ).toThrow()
})
