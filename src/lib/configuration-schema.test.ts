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
