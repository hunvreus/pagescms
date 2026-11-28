import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadReferenceOptions } from './reference'
import { selectedReferenceOptions } from '#/lib/reference-pages'
import type { Database } from '#/server/db/client'
import type { RepositoryAccessService } from '#/server/access/repository'

const mocks = vi.hoisted(
  (): { schema: Record<string, unknown>; get: ReturnType<typeof vi.fn> } => ({
    schema: {},
    get: vi.fn(),
  }),
)
const customRead = vi.hoisted(() =>
  vi.fn(
    (
      value: unknown,
      _field: unknown,
      configuration: { content: Array<{ name: string }> },
    ) => {
      const name = configuration.content[0].name
      expect(Object.isFrozen(configuration)).toBe(true)
      expect(Object.isFrozen(configuration.content[0])).toBe(true)
      expect(() => {
        configuration.content[0].name = 'mutated'
      }).toThrow(TypeError)
      return `${name}:${String(value)}`
    },
  ),
)
vi.mock('#/fields/registry', () => ({
  customFieldDefinition: (type: string) =>
    type === 'test-reference-custom' ? { read: customRead } : undefined,
}))
vi.mock('#/server/cache/configuration', () => ({
  createConfigurationStore: () => ({
    get: async () => ({ object: { content: [mocks.schema] } }),
  }),
}))
vi.mock('#/server/cache/directory', () => ({
  createDirectoryCache: () => ({ get: mocks.get }),
}))
const base = {
  database: {} as Database,
  repositoryAccess: {
    resolve: async () => ({ api: {} }),
  } as unknown as RepositoryAccessService,
  user: { id: 'u', email: 'u@example.com', githubUsername: null },
  owner: 'o',
  repo: 'r',
  branch: 'main',
  collection: 'posts',
  query: '',
  valueTemplate: '{path}',
  labelTemplate: '{name}',
  searchFields: ['name'],
  selectedValues: [] as string[],
}
const file = (
  name: string,
  fields: Record<string, unknown>,
  path = `posts/${name}`,
) => ({ type: 'file', name, path, content: JSON.stringify(fields) })
beforeEach(() => {
  vi.clearAllMocks()
  mocks.schema = {
    type: 'collection',
    name: 'posts',
    path: 'posts',
    format: 'json',
    fields: [{ name: 'title', type: 'string' }],
  }
})

describe('reference resolution', () => {
  it('shares frozen configuration with custom field reads', async () => {
    mocks.schema.fields = [{ name: 'title', type: 'test-reference-custom' }]
    mocks.get.mockResolvedValue({
      entries: [
        file('one.json', { title: 'One' }),
        file('two.json', { title: 'Two' }),
      ],
    })
    const result = await loadReferenceOptions({
      ...base,
      labelTemplate: '{title}',
    })
    expect(result.options.map((option) => option.label)).toEqual([
      'posts:One',
      'posts:Two',
    ])
    expect(customRead).toHaveBeenCalledTimes(2)
    expect(customRead.mock.calls[0][2]).toBe(customRead.mock.calls[1][2])
  })
  it('discovers nested primary fields, indexed paths and escaped braces', async () => {
    mocks.schema.fields = [
      {
        name: 'seo',
        type: 'object',
        fields: [{ name: 'title', type: 'string' }],
      },
    ]
    mocks.get.mockResolvedValue({
      entries: [
        file('one.json', {
          seo: { title: 'Hello' },
          authors: [{ name: 'Ronan' }],
        }),
      ],
    })
    expect(
      (
        await loadReferenceOptions({
          ...base,
          labelTemplate: '{primary} {authors[0].name} \\{literal\\}',
        })
      ).options,
    ).toEqual([{ value: 'posts/one.json', label: 'Hello Ronan {literal}' }])
  })
  it('applies read transforms and filename dates without inventing default values', async () => {
    mocks.schema.filename = '{year}-{month}-{day}-{primary}.json'
    mocks.schema.fields = [
      { name: 'date', type: 'date', options: { format: 'dd/MM/yyyy' } },
      { name: 'id', type: 'uuid' },
    ]
    mocks.get.mockResolvedValue({
      entries: [
        file('2026-10-19-one.json', { date: '19/10/2026' }),
        file('2026-10-19-two.json', {}),
      ],
    })
    expect(
      (
        await loadReferenceOptions({ ...base, labelTemplate: '{date} {id}' })
      ).options.map((option) => option.label),
    ).toEqual(['2026-10-19 ', '2026-10-19 '])
  })
  it('continues through more than 100 files in one directory', async () => {
    mocks.get.mockResolvedValue({
      entries: Array.from({ length: 205 }, (_, i) =>
        file(`${i}.json`, { title: `Title ${i}` }),
      ),
    })
    const page = await loadReferenceOptions(base)
    expect(page.options).toHaveLength(100)
    expect(page.cursor).toBeDefined()
    const second = await loadReferenceOptions({ ...base, cursor: page.cursor })
    const third = await loadReferenceOptions({ ...base, cursor: second.cursor })
    expect(
      [...page.options, ...second.options, ...third.options].map(
        (option) => option.value,
      ),
    ).toEqual(Array.from({ length: 205 }, (_, i) => `posts/${i}.json`))
    expect(third.cursor).toBeUndefined()
  })
  it('continues scans beyond 50 directories for search and custom selected values', async () => {
    mocks.get.mockImplementation(async ({ path }: { path: string }) => ({
      entries:
        path === 'posts'
          ? Array.from({ length: 60 }, (_, i) => ({
              type: 'dir',
              name: String(i),
              path: `posts/${i}`,
            }))
          : [file('one.json', { title: path }, `${path}/one.json`)],
    }))
    const input = {
      ...base,
      valueTemplate: '{primary}',
      selectedValues: ['posts/59'],
    }
    const first = await loadReferenceOptions(input)
    expect(first.options).toEqual([])
    expect(first.cursor).toBeDefined()
    expect(
      await selectedReferenceOptions(
        (cursor) => loadReferenceOptions({ ...input, cursor }),
        input.selectedValues,
      ),
    ).toEqual([{ value: 'posts/59', label: 'one.json' }])
  })
  it('resolves default path selections in one cached directory call without scanning siblings', async () => {
    mocks.schema.fields = [{ name: 'title', type: 'test-reference-custom' }]
    mocks.get.mockResolvedValue({
      entries: [
        file('one.json', { title: 'One' }, 'posts/59/one.json'),
        file('two.json', { title: 'Two' }, 'posts/59/two.json'),
      ],
    })
    expect(
      (
        await loadReferenceOptions({
          ...base,
          selectedValues: ['posts/59/one.json'],
        })
      ).options,
    ).toEqual([{ value: 'posts/59/one.json', label: 'one.json' }])
    expect(mocks.get).toHaveBeenCalledTimes(1)
    expect(mocks.get.mock.calls[0][0].path).toBe('posts/59')
    expect(customRead).toHaveBeenCalledOnce()
  })
  it('retains immediate node enrichment with subfolders disabled, without duplicate recursive nodes', async () => {
    mocks.schema = {
      ...mocks.schema,
      subfolders: false,
      view: { node: { filename: 'index.json' } },
    }
    mocks.get.mockResolvedValue({
      entries: [
        file('root.json', {}),
        { type: 'dir', path: 'posts/child', name: 'child' },
        file('index.json', {}, 'posts/child/index.json'),
      ],
    })
    expect(
      (await loadReferenceOptions(base)).options.map((option) => option.value),
    ).toEqual(['posts/root.json', 'posts/child/index.json'])
    expect(mocks.get.mock.calls[0][0].nodeFilename).toBe('index.json')
  })
  it.each([
    '{"directories":["outside"],"offset":0}',
    '{"directories":["posts/../outside"],"offset":0}',
    '{"directories":["posts"],"offset":-1}',
    'broken',
  ])('rejects a forged continuation: %s', async (cursor) => {
    await expect(loadReferenceOptions({ ...base, cursor })).rejects.toThrow()
    expect(mocks.get).not.toHaveBeenCalled()
  })
})

it('continues a non-empty search query beyond the per-request directory budget', async () => {
  mocks.get.mockImplementation(async ({ path }: { path: string }) => ({
    entries:
      path === 'posts'
        ? Array.from({ length: 60 }, (_, i) => ({
            type: 'dir',
            name: String(i),
            path: `posts/${i}`,
          }))
        : [
            file(
              'one.json',
              { title: path === 'posts/59' ? 'Needle' : 'Other' },
              `${path}/one.json`,
            ),
          ],
  }))
  const input = { ...base, query: 'needle', searchFields: ['primary'] }
  const first = await loadReferenceOptions(input)
  expect(first.options).toEqual([])
  expect(first.cursor).toBeDefined()
  const next = await loadReferenceOptions({ ...input, cursor: first.cursor })
  expect(next.options).toEqual([
    { value: 'posts/59/one.json', label: 'one.json' },
  ])
  expect(next.cursor).toBeUndefined()
})
it('finishes a continuation whose directory shrank below its previous offset', async () => {
  mocks.get.mockResolvedValue({ entries: [file('one.json', {})] })
  expect(
    await loadReferenceOptions({
      ...base,
      cursor: JSON.stringify({ directories: ['posts'], offset: 100 }),
    }),
  ).toEqual({ options: [] })
  expect(mocks.get).toHaveBeenCalledTimes(1)
})

it('resolves same-file translated labels and the locale template token', async () => {
  mocks.schema.i18n = {
    scheme: 'fields',
    default: 'en',
    locales: [
      { code: 'en', label: 'English' },
      { code: 'fr', label: 'French' },
    ],
  }
  mocks.schema.fields = [{ name: 'title', type: 'string', localized: true }]
  mocks.get.mockResolvedValue({
    entries: [file('one.json', { title: { en: 'Hello', fr: 'Bonjour' } })],
  })
  expect(
    (
      await loadReferenceOptions({
        ...base,
        locale: 'fr',
        labelTemplate: '{primary} ({locale})',
      })
    ).options,
  ).toEqual([{ value: 'posts/one.json', label: 'Bonjour (fr)' }])
  expect(
    (
      await loadReferenceOptions({
        ...base,
        locale: 'ar',
        labelTemplate: '{primary}',
      })
    ).options,
  ).toEqual([{ value: 'posts/one.json', label: 'Hello' }])
})
it('discovers file translations above the literal collection root for references', async () => {
  mocks.schema.i18n = {
    scheme: 'files',
    default: 'en',
    locales: [
      { code: 'en', label: 'English' },
      { code: 'fr', label: 'French' },
    ],
    path: { type: 'folder', position: 'root', default: 'omit' },
  }
  mocks.get.mockImplementation(async ({ path }: { path: string }) => ({
    entries:
      path === 'fr/posts'
        ? [file('one.json', { title: 'Bonjour' }, 'fr/posts/one.json')]
        : [],
  }))
  expect(
    (
      await loadReferenceOptions({
        ...base,
        locale: 'fr',
        labelTemplate: '{primary}',
      })
    ).options,
  ).toEqual([{ value: 'fr/posts/one.json', label: 'Bonjour' }])
  expect(mocks.get.mock.calls[0][0].path).toBe('fr/posts')
})

it('excludes canonical filenames from non-default language references', async () => {
  mocks.schema.exclude = ['index.json']
  mocks.schema.i18n = {
    scheme: 'files',
    default: 'en',
    locales: [
      { code: 'en', label: 'English' },
      { code: 'fr', label: 'French' },
    ],
    path: {
      type: 'filename',
      position: 'suffix',
      separator: '.',
      default: 'omit',
    },
  }
  mocks.get.mockResolvedValue({
    entries: [
      file('index.fr.json', { title: 'Excluded' }),
      file('one.fr.json', { title: 'Bonjour' }),
    ],
  })
  const result = await loadReferenceOptions({
    ...base,
    locale: 'fr',
    labelTemplate: '{primary}',
  })
  expect(result.options).toEqual([
    { value: 'posts/one.fr.json', label: 'Bonjour' },
  ])
})
