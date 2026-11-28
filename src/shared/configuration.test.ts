import { describe, expect, it } from 'vitest'

import {
  CONFIGURATION_VERSION,
  isConfigurationEditingEnabled,
  isCacheManagementEnabled,
  normalizeConfiguration,
} from '#/shared/configuration'

describe('configuration settings normalization', () => {
  it('does not translate obsolete settings into current settings', () => {
    expect(
      normalizeConfiguration({ settings: false, cache: true, hide: true })
        .settings,
    ).toEqual({})
    expect(
      normalizeConfiguration({ settings: { hide: true } }).settings,
    ).toEqual({})
  })
  it('preserves explicit settings', () => {
    const normalized = normalizeConfiguration({
      settings: { config: true, cache: false },
    })
    expect(normalized.settings).toEqual({ config: true, cache: false })
    expect(isConfigurationEditingEnabled(normalized)).toBe(true)
    expect(CONFIGURATION_VERSION).toBe('3.9')
  })
})

describe('media normalization', () => {
  it('expands the string shorthand and builds media navigation', () => {
    expect(normalizeConfiguration({ media: '/public/images/' })).toEqual({
      settings: {},
      media: [
        {
          name: 'default',
          input: 'public/images',
          output: '/public/images',
        },
      ],
      navigation: {
        media: [
          {
            type: 'media',
            name: 'default',
            label: 'Media',
            defaultLabel: 'media',
          },
        ],
      },
    })
  })

  it('normalizes named media, expands categories, and preserves commit templates', () => {
    const normalized = normalizeConfiguration({
      media: [
        {
          name: 'docs',
          input: '/assets/docs/',
          output: '/assets/docs/',
          categories: ['document'],
          commit: { templates: { create: 'Upload {path}' } },
        },
        {
          name: 'images',
          input: 'images',
          output: '/',
          extensions: ['png'],
          categories: ['image'],
        },
      ],
    })

    expect(normalized.media).toEqual([
      expect.objectContaining({
        input: 'assets/docs',
        output: '/assets/docs',
        extensions: expect.arrayContaining(['pdf', 'docx']),
        commit: { templates: { create: 'Upload {path}' } },
      }),
      expect.objectContaining({
        input: 'images',
        output: '/',
        extensions: ['png'],
      }),
    ])
    for (const media of normalized.media as Record<string, unknown>[]) {
      expect(media).not.toHaveProperty('categories')
    }
  })
})

describe('content normalization', () => {
  it.each([
    ['json', 'json'],
    ['yaml', 'yml'],
    ['toml', 'toml'],
    ['yaml-frontmatter', 'md'],
  ])('defaults the filename extension for %s to %s', (format, extension) => {
    const normalized = normalizeConfiguration({
      content: [{ type: 'collection', name: 'posts', path: 'posts', format }],
    })
    expect(normalized.content).toEqual([
      expect.objectContaining({
        filename: `{year}-{month}-{day}-{primary}.${extension}`,
        extension,
        format,
      }),
    ])
  })

  it('respects explicit filename and extension settings', () => {
    const normalized = normalizeConfiguration({
      content: [
        {
          type: 'collection',
          name: 'custom',
          path: 'custom',
          filename: '{primary}.json',
        },
        {
          type: 'collection',
          name: 'yaml',
          path: 'yaml',
          format: 'yaml',
          extension: 'yaml',
        },
      ],
    })
    expect(normalized.content).toEqual([
      expect.objectContaining({
        filename: '{primary}.json',
        extension: 'json',
        format: 'code',
      }),
      expect.objectContaining({
        filename: '{year}-{month}-{day}-{primary}.yaml',
        extension: 'yaml',
        format: 'yaml',
      }),
    ])
  })
  it('flattens groups, applies format defaults, and retains nested navigation', () => {
    const normalized = normalizeConfiguration({
      content: [
        {
          type: 'group',
          name: 'writing',
          label: 'Writing',
          items: [
            {
              type: 'collection',
              name: 'posts',
              path: '/content/posts/',
              fields: [{ name: 'title', type: 'string' }],
            },
          ],
        },
        { type: 'file', name: 'data', path: 'data/site.json', fields: [] },
        { type: 'file', name: 'script', path: 'scripts/site.ts' },
        { type: 'file', name: 'table', path: 'data/people.csv' },
      ],
    })

    expect(normalized.content).toEqual([
      expect.objectContaining({
        type: 'collection',
        name: 'posts',
        path: 'content/posts',
        filename: '{year}-{month}-{day}-{primary}.md',
        extension: 'md',
        format: 'yaml-frontmatter',
      }),
      expect.objectContaining({ extension: 'json', format: 'code' }),
      expect.objectContaining({ extension: 'ts', format: 'code' }),
      expect.objectContaining({ extension: 'csv', format: 'datagrid' }),
    ])
    expect(normalized.navigation).toEqual({
      content: [
        {
          type: 'group',
          name: 'writing',
          label: 'Writing',
          items: [{ type: 'collection', name: 'posts', label: 'posts' }],
        },
        { type: 'file', name: 'data', label: 'data' },
        { type: 'file', name: 'script', label: 'script' },
        { type: 'file', name: 'table', label: 'table' },
      ],
    })
  })

  it('preserves filename-field behavior and normalizes node views', () => {
    const normalized = normalizeConfiguration({
      content: [
        {
          type: 'collection',
          name: 'pages',
          path: 'content/pages',
          filename: { template: '{primary}.md', field: 'create' },
          view: { node: 'index.md' },
        },
      ],
    })

    expect(normalized.content).toEqual([
      expect.objectContaining({
        filename: '{primary}.md',
        filenameField: 'create',
        view: { node: { filename: 'index.md', hideDirs: 'nodes' } },
      }),
    ])
  })

  it('resolves reusable components with local arrays replacing defaults', () => {
    const normalized = normalizeConfiguration({
      components: {
        seo: {
          type: 'object',
          label: 'SEO defaults',
          fields: [{ name: 'title', type: 'string' }],
          options: { collapsed: true },
        },
      },
      content: [
        {
          type: 'file',
          name: 'home',
          path: 'index.md',
          fields: [
            {
              name: 'seo',
              component: 'seo',
              label: 'SEO',
              fields: [{ name: 'description', type: 'text' }],
            },
          ],
        },
      ],
    })

    expect(normalized.content).toEqual([
      expect.objectContaining({
        fields: [
          {
            name: 'seo',
            type: 'object',
            label: 'SEO',
            fields: [{ name: 'description', type: 'text' }],
            options: { collapsed: true },
          },
        ],
      }),
    ])
  })

  it.each(['../outside', 'content/../../outside'])(
    'rejects a content path escaping the repository: %s',
    (path) => {
      expect(() =>
        normalizeConfiguration({
          content: [{ type: 'file', name: 'unsafe', path }],
        }),
      ).toThrow('repository root')
    },
  )
})

describe('cache management opt-in', () => {
  it('requires an explicit true setting', () => {
    expect(isCacheManagementEnabled()).toBe(false)
    expect(isCacheManagementEnabled({})).toBe(false)
    expect(isCacheManagementEnabled({ settings: { cache: false } })).toBe(false)
    expect(isCacheManagementEnabled({ settings: { cache: true } })).toBe(true)
    expect(isCacheManagementEnabled({ settings: { cache: 'true' } })).toBe(
      false,
    )
  })
})

it('normalizes empty media shorthand as the repository root', () => {
  expect(normalizeConfiguration({ media: '' })).toMatchObject({
    media: [{ name: 'default', input: '', output: '/' }],
    navigation: { media: [{ type: 'media', name: 'default' }] },
  })
})

it('resolves component chains independently of declaration order', () => {
  const base = { type: 'string', options: { required: true } }
  const alias = { component: 'base', label: 'Alias' }
  const normalize = (components: Record<string, unknown>) =>
    normalizeConfiguration({
      components,
      content: [
        {
          type: 'file',
          name: 'home',
          path: 'home.yml',
          fields: [{ name: 'title', component: 'alias' }],
        },
      ],
    })
  const first = normalize({ alias, base })
  const second = normalize({ base, alias })
  expect(first).toEqual(second)
  expect(first.content).toMatchObject([
    {
      fields: [
        {
          name: 'title',
          type: 'string',
          label: 'Alias',
          options: { required: true },
        },
      ],
    },
  ])
})

it.each([
  { loop: { type: 'object', fields: [{ name: 'child', component: 'loop' }] } },
  { first: { component: 'second' }, second: { component: 'first' } },
])(
  'reports recursive component definitions instead of overflowing',
  (components) => {
    expect(() => normalizeConfiguration({ components })).toThrow(
      'Circular component reference',
    )
  },
)

it('can reuse a component in independent sibling fields without mutating definitions', () => {
  const source = {
    components: { text: { type: 'string' } },
    content: [
      {
        type: 'file',
        name: 'home',
        path: 'home.yml',
        fields: [
          { name: 'one', component: 'text' },
          { name: 'two', component: 'text' },
        ],
      },
    ],
  }
  const before = structuredClone(source)
  expect(normalizeConfiguration(source).content).toMatchObject([
    {
      fields: [
        { name: 'one', type: 'string' },
        { name: 'two', type: 'string' },
      ],
    },
  ])
  expect(source).toEqual(before)
})

it('distinguishes a system media label from an explicit author label', () => {
  const implicit = normalizeConfiguration({
    media: { input: 'images', output: '/images' },
  })
  const explicit = normalizeConfiguration({
    media: { label: 'Media', input: 'images', output: '/images' },
  })
  expect(implicit.navigation).toMatchObject({
    media: [{ defaultLabel: 'media' }],
  })
  expect(explicit.navigation).toMatchObject({ media: [{ label: 'Media' }] })
  expect(explicit.navigation).not.toMatchObject({
    media: [{ defaultLabel: 'media' }],
  })
})
