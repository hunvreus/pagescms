import { describe, expect, it } from 'vitest'

import {
  CONFIGURATION_VERSION,
  isConfigurationEditingEnabled,
  normalizeConfiguration,
} from './configuration'

describe('configuration settings normalization', () => {
  it('migrates legacy root toggles without mutating the source', () => {
    const source = {
      settings: false,
      cache: true,
      hide: true,
    }

    expect(normalizeConfiguration(source)).toEqual({
      settings: { config: false },
    })
    expect(source).toEqual({ settings: false, cache: true, hide: true })
  })

  it('gives explicit modern settings precedence over legacy toggles', () => {
    const normalized = normalizeConfiguration({
      settings: { config: true, cache: false },
      cache: true,
      hide: true,
    })

    expect(normalized.settings).toEqual({ config: true })
    expect(isConfigurationEditingEnabled(normalized)).toBe(true)
    expect(CONFIGURATION_VERSION).toBe('3.0')
  })

  it('migrates nested settings.hide and commit.message', () => {
    expect(
      normalizeConfiguration({
        settings: {
          hide: true,
          commit: { message: { update: 'Update {path}' }, identity: 'user' },
        },
      }),
    ).toEqual({
      settings: {
        config: false,
        commit: {
          templates: { update: 'Update {path}' },
          identity: 'user',
        },
      },
    })
  })
})

describe('media normalization', () => {
  it('expands the legacy string form and builds media navigation', () => {
    expect(normalizeConfiguration({ media: '/public/images/' })).toEqual({
      settings: {},
      media: [
        {
          name: 'default',
          label: 'Media',
          input: 'public/images',
          output: '/public/images',
        },
      ],
      navigation: {
        media: [{ type: 'media', name: 'default', label: 'Media' }],
      },
    })
  })

  it('normalizes named media, expands categories, and migrates commits', () => {
    const normalized = normalizeConfiguration({
      media: [
        {
          name: 'docs',
          input: '/assets/docs/',
          output: '/assets/docs/',
          categories: ['document'],
          commit: { message: { create: 'Upload {path}' } },
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
