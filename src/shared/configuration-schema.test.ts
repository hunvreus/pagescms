import { describe, expect, it } from 'vitest'

import { ConfigurationSchema } from '#/shared/configuration-schema'

describe('ConfigurationSchema', () => {
  it.each(['collection', 'file'] as const)(
    'accepts operations: false for a %s and rejects true',
    (type) => {
      const entry = { name: 'example', type, path: 'content/example.yml' }
      expect(
        ConfigurationSchema.safeParse({
          content: [{ ...entry, operations: false }],
        }).success,
      ).toBe(true)
      expect(
        ConfigurationSchema.safeParse({
          content: [{ ...entry, operations: true }],
        }).success,
      ).toBe(false)
    },
  )
  it.each([
    ['{primary}/_index.md', true, true],
    [{ template: '{year}/{month}/{primary}.md', field: 'create' }, true, true],
    ['{primary}.md', false, true],
    ['{primary}/_index.md', false, false],
    [{ template: 'a/../post.md' }, true, false],
  ] as const)(
    'validates collection filename %j with subfolders %s',
    (filename, subfolders, valid) => {
      const result = ConfigurationSchema.safeParse({
        content: [
          {
            name: 'posts',
            type: 'collection',
            path: 'content',
            filename,
            subfolders,
          },
        ],
      })
      expect(result.success).toBe(valid)
      if (!result.success)
        expect(result.error.issues[0].path).toContain('filename')
    },
  )

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

it('accepts Hugeicons content names with optional Icon suffix and rejects paths or non-string names', () => {
  const config = (icon: unknown) => ({
    content: [{ name: 'posts', type: 'collection', path: 'posts', icon }],
  })
  expect(ConfigurationSchema.safeParse(config('News01')).success).toBe(true)
  expect(ConfigurationSchema.safeParse(config('NotARealIcon')).success).toBe(
    true,
  )
  expect(ConfigurationSchema.safeParse(config('../newspaper')).success).toBe(
    false,
  )
  expect(
    ConfigurationSchema.safeParse(config({ name: 'newspaper' })).success,
  ).toBe(false)
})

describe('action placement and context scopes', () => {
  const action = { name: 'deploy', label: 'Deploy', workflow: 'deploy.yml' }
  it.each([undefined, 'sidebar', 'overview'])(
    'accepts top-level scope %s',
    (scope) => {
      expect(
        ConfigurationSchema.safeParse({ actions: [{ ...action, scope }] })
          .success,
      ).toBe(true)
    },
  )
  it.each(['entry', 'collection'])(
    'rejects top-level context scope %s even without content',
    (scope) => {
      const parsed = ConfigurationSchema.safeParse({
        actions: [{ ...action, scope }],
      })
      expect(parsed.success).toBe(false)
      if (!parsed.success)
        expect(parsed.error.issues[0]).toMatchObject({
          path: ['actions', 0, 'scope'],
          message: expect.stringContaining('Top-level actions'),
        })
    },
  )
  it.each(['sidebar', 'overview'])(
    'rejects placement scope %s on content and media',
    (scope) => {
      for (const type of ['file', 'collection']) {
        expect(
          ConfigurationSchema.safeParse({
            content: [
              {
                name: 'posts',
                type,
                path: 'posts',
                actions: [{ ...action, scope }],
              },
            ],
          }).success,
        ).toBe(false)
      }
      expect(
        ConfigurationSchema.safeParse({
          media: {
            input: 'images',
            output: '/images',
            actions: [{ ...action, scope }],
          },
        }).success,
      ).toBe(false)
    },
  )
  it('keeps collection and file rules inside groups', () => {
    for (const scope of ['collection', 'entry'])
      expect(
        ConfigurationSchema.safeParse({
          content: [
            {
              name: 'group',
              type: 'group',
              items: [
                {
                  name: 'posts',
                  type: 'collection',
                  path: 'posts',
                  actions: [{ ...action, scope }],
                },
              ],
            },
          ],
        }).success,
      ).toBe(true)
    expect(
      ConfigurationSchema.safeParse({
        content: [
          { name: 'home', type: 'file', path: 'home.md', actions: [action] },
        ],
      }).success,
    ).toBe(true)
  })
})

it('allows list limits without requiring collapse presentation settings', () => {
  expect(
    ConfigurationSchema.safeParse({
      content: [
        {
          type: 'file',
          name: 'example',
          path: 'example.json',
          fields: [
            { name: 'counts', type: 'number', list: { min: 1, max: 3 } },
          ],
        },
      ],
    }).success,
  ).toBe(true)
})

it.each(['', 'a', 'a/b'])(
  'accepts root and short configured paths: %s',
  (path) => {
    expect(ConfigurationSchema.safeParse({ media: path }).success).toBe(true)
    expect(
      ConfigurationSchema.safeParse({
        media: { input: path, output: path ? `/${path}` : '/', path },
      }).success,
    ).toBe(true)
    expect(
      ConfigurationSchema.safeParse({
        content: [{ type: 'collection', name: 'posts', path }],
      }).success,
    ).toBe(true)
  },
)
it.each(['/a', 'a/', '../a'])('rejects invalid relative paths: %s', (path) => {
  expect(ConfigurationSchema.safeParse({ media: path }).success).toBe(false)
  expect(
    ConfigurationSchema.safeParse({
      content: [{ type: 'collection', name: 'posts', path }],
    }).success,
  ).toBe(false)
})

describe('plugin media schema composition', () => {
  it('validates added properties on both object and named media', async () => {
    const { createConfigurationSchema } =
      await import('#/shared/configuration-schema')
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
      schema.safeParse({
        media: { input: 'images', output: '/images', storage: 'assets' },
      }).success,
    ).toBe(true)
    expect(
      schema.safeParse({
        media: [
          {
            name: 'images',
            input: 'images',
            output: '/images',
            storage: 'assets',
          },
        ],
      }).success,
    ).toBe(true)
    expect(
      schema.safeParse({
        media: { input: 'images', output: '/images', storage: 12 },
      }).success,
    ).toBe(false)
  })

  it('protects media properties required by core', async () => {
    const { createConfigurationSchema } =
      await import('#/shared/configuration-schema')
    for (const name of ['name', 'input', 'output']) {
      expect(() =>
        createConfigurationSchema([
          {
            id: 'plugin',
            configurationSchema: {
              media: {
                [name]: { action: 'remove' },
              },
            },
          },
        ]),
      ).toThrow(`Media property ${name} is required by core`)
    }
  })

  it('supports explicit replacement/removal and rejects conflicting changes', async () => {
    const { createConfigurationSchema } =
      await import('#/shared/configuration-schema')
    const schema = createConfigurationSchema([
      {
        id: 'custom',
        configurationSchema: {
          media: {
            label: { action: 'replace', schema: (z) => z.literal('custom') },
            path: { action: 'remove' },
          },
        },
      },
    ])
    expect(
      schema.safeParse({
        media: { input: 'images', output: '/images', label: 'custom' },
      }).success,
    ).toBe(true)
    expect(
      schema.safeParse({
        media: { input: 'images', output: '/images', label: 'wrong' },
      }).success,
    ).toBe(false)
    expect(
      schema.safeParse({
        media: {
          input: 'images',
          output: '/images',
          label: 'custom',
          path: 'x',
        },
      }).success,
    ).toBe(false)
    expect(() =>
      createConfigurationSchema([
        {
          id: 'one',
          configurationSchema: {
            media: { storage: { action: 'add', schema: (z) => z.string() } },
          },
        },
        {
          id: 'two',
          configurationSchema: {
            media: { storage: { action: 'add', schema: (z) => z.string() } },
          },
        },
      ]),
    ).toThrow('Conflicting media property storage')
  })
})

describe('content localization configuration', () => {
  const base = {
    i18n: { default: 'en', locales: ['en', { code: 'fr', label: 'Français' }] },
    content: [
      {
        name: 'about',
        type: 'file',
        path: 'content/about.json',
        i18n: { scheme: 'fields' },
        fields: [{ name: 'title', type: 'string', localized: true }],
      },
    ],
  }
  it('accepts generated labels, inherited locales and resolved component flags', () => {
    expect(ConfigurationSchema.safeParse(base).success).toBe(true)
    expect(
      ConfigurationSchema.safeParse({
        ...base,
        components: { title: { type: 'string', localized: true } },
        content: [
          {
            ...base.content[0],
            fields: [{ name: 'title', component: 'title' }],
          },
        ],
      }).success,
    ).toBe(true)
  })
  it('rejects unsupported names, nested wrappers, unknown defaults and misplaced raw bodies', () => {
    for (const item of [
      { ...base.content[0], i18n: { mode: 'fields' } },
      { ...base.content[0], localized: true },
      { ...base.content[0], i18n: { scheme: 'fields', locales: ['fr'] } },
      {
        ...base.content[0],
        path: 'content/about.md',
        localized: true,
        fields: [{ name: 'body', type: 'rich-text' }],
      },
      {
        ...base.content[0],
        i18n: { scheme: 'fields', path: { type: 'folder', position: 'root' } },
      },
    ])
      expect(
        ConfigurationSchema.safeParse({ ...base, content: [item] }).success,
      ).toBe(false)
  })
  it('allows normal nested fields named body in frontmatter', () => {
    expect(
      ConfigurationSchema.safeParse({
        ...base,
        content: [
          {
            ...base.content[0],
            path: 'content/about.md',
            fields: [
              {
                name: 'hero',
                type: 'object',
                localized: true,
                fields: [{ name: 'body', type: 'rich-text' }],
              },
            ],
          },
        ],
      }).success,
    ).toBe(true)
  })
})

it.each(['object', 'array'])(
  'validates media icons consistently in %s configuration',
  (format) => {
    function config(icon: unknown) {
      const media = {
        name: 'images',
        input: 'public/images',
        output: '/images',
        icon,
      }
      return { media: format === 'array' ? [media] : media }
    }
    for (const icon of ['Image01', 'Folder02Icon', 'NotARealIcon'])
      expect(ConfigurationSchema.safeParse(config(icon)).success).toBe(true)
    for (const icon of ['../images', 'bad/name', '', 42, { name: 'images' }])
      expect(ConfigurationSchema.safeParse(config(icon)).success).toBe(false)
  },
)
