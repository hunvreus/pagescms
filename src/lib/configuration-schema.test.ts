import { describe, expect, it } from 'vitest'

import { ConfigurationSchema } from './configuration-schema'

describe('ConfigurationSchema', () => {
  it('accepts the opt-in cache management setting and rejects the legacy root switch', () => {
    expect(
      ConfigurationSchema.safeParse({ settings: { cache: true } }).success,
    ).toBe(true)
    expect(
      ConfigurationSchema.safeParse({ settings: { cache: false } }).success,
    ).toBe(true)
    expect(ConfigurationSchema.safeParse({ cache: true }).success).toBe(false)
  })
  it('accepts representative legacy content, media, settings, and actions', () => {
    expect(
      ConfigurationSchema.safeParse({
        media: 'images',
        settings: {
          commit: { identity: 'user', templates: { update: 'Update {path}' } },
        },
        content: [
          {
            type: 'collection',
            name: 'posts',
            path: 'content/posts',
            view: { foldersFirst: true },
            fields: [
              { name: 'title', type: 'string', required: true },
              {
                name: 'author',
                type: 'object',
                fields: [{ name: 'name', type: 'string' }],
              },
            ],
            actions: [
              {
                name: 'publish',
                label: 'Publish',
                workflow: 'publish.yml',
                scope: 'entry',
              },
            ],
          },
        ],
      }).success,
    ).toBe(true)
  })

  it.each([
    {
      name: 'leading content path',
      value: { content: [{ type: 'file', name: 'home', path: '/index.md' }] },
      message: 'valid relative path',
    },
    {
      name: 'repository-escaping content path',
      value: {
        content: [{ type: 'file', name: 'home', path: '../outside.md' }],
      },
      message: 'cannot escape',
    },
    {
      name: 'unknown field type',
      value: {
        content: [
          {
            type: 'file',
            name: 'home',
            path: 'index.md',
            fields: [{ name: 'title', type: 'unknown-field' }],
          },
        ],
      },
      message: 'valid field type',
    },
    {
      name: 'field with type and component',
      value: {
        content: [
          {
            type: 'file',
            name: 'home',
            path: 'index.md',
            fields: [{ name: 'title', type: 'string', component: 'title' }],
          },
        ],
      },
      message: "exactly one of 'type' or 'component'",
    },
    {
      name: 'collection action without scope',
      value: {
        content: [
          {
            type: 'collection',
            name: 'posts',
            path: 'posts',
            actions: [
              { name: 'publish', label: 'Publish', workflow: 'publish.yml' },
            ],
          },
        ],
      },
      message: 'must define',
    },
  ])('rejects $name', ({ value, message }) => {
    const result = ConfigurationSchema.safeParse(value)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(
        result.error.issues.map((issue) => issue.message).join(' '),
      ).toContain(message)
    }
  })

  it('rejects unknown top-level keys', () => {
    const result = ConfigurationSchema.safeParse({ surprise: true })
    expect(result.success).toBe(false)
  })
})

describe('rich-text HTML configuration', () => {
  const config = (html: unknown) => ({
    content: [
      {
        type: 'file',
        name: 'home',
        path: 'index.md',
        fields: [
          {
            name: 'body',
            type: 'rich-text',
            options: { format: 'markdown', html },
          },
        ],
      },
    ],
  })
  it('accepts selector policies and attribute permissions', () => {
    expect(
      ConfigurationSchema.safeParse(
        config({
          keep: ['div.callout', 'details', 'summary'],
          strip: ['.legacy'],
          drop: ['.discard'],
          attributes: ['class', 'data-kind'],
        }),
      ).success,
    ).toBe(true)
  })
  it.each([
    { keep: 'div' },
    { attributes: [42] },
    { keep: ['div'], unknown: true },
  ])('rejects malformed HTML policies', (html) => {
    expect(ConfigurationSchema.safeParse(config(html)).success).toBe(false)
  })
})

describe('rich-text snippets', () => {
  const config = (snippets: unknown) => ({
    content: [
      {
        name: 'home',
        type: 'file',
        path: 'home.md',
        fields: [{ name: 'body', type: 'rich-text', options: { snippets } }],
      },
    ],
  })
  it('accepts source, labels and optional input format without changing source', () => {
    const source = '<div>HTML</div>\n'
    const result = ConfigurationSchema.safeParse(
      config([{ label: 'Alert', source, format: 'html' }]),
    )
    expect(result.success).toBe(true)
    if (result.success) expect(JSON.stringify(result.data)).toContain('HTML')
  })
  it.each([
    [{ label: '', source: 'hello' }],
    [{ label: 'Alert', source: '  ' }],
    [{ label: 'Alert', content: 'hello' }],
    [{ label: 'Alert', source: 'hi', format: 'mdx' }],
  ])('rejects invalid snippets', (...snippets) => {
    expect(ConfigurationSchema.safeParse(config(snippets)).success).toBe(false)
  })
})

it('accepts kebab-case content icons and rejects paths or non-string names', () => {
  const config = (icon: unknown) => ({
    content: [{ name: 'posts', type: 'collection', path: 'posts', icon }],
  })
  expect(ConfigurationSchema.safeParse(config('newspaper')).success).toBe(true)
  expect(ConfigurationSchema.safeParse(config('not-a-real-icon')).success).toBe(
    true,
  )
  expect(ConfigurationSchema.safeParse(config('../newspaper')).success).toBe(
    false,
  )
  expect(
    ConfigurationSchema.safeParse(config({ name: 'newspaper' })).success,
  ).toBe(false)
})
