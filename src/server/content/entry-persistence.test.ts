import { normalizeConfiguration } from '#/shared/configuration'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ContentFormat } from '#/shared/content-serialization'
import type { JsonObject } from '#/shared/json'
import type { Database } from '#/server/db/client'
import { parseContent, serializeContent } from '#/shared/content-serialization'
import {
  createStructuredEntry,
  createRawEntry,
  renameContentEntry,
  loadRawEntry,
  saveStructuredEntry,
} from './entry-editor'

const state = vi.hoisted((): { configuration: Record<string, unknown> } => ({
  configuration: {},
}))
vi.mock('#/server/cache/configuration', () => ({
  createConfigurationStore: () => ({
    get: async () => ({ object: state.configuration }),
  }),
}))
vi.mock('#/server/cache/repository', () => ({
  updateRepositoryCacheAfterMutation: vi.fn(),
}))

const scalarFields = [
  { name: 'title', type: 'string' },
  { name: 'text', type: 'text' },
  { name: 'body', type: 'rich-text' },
  { name: 'html', type: 'rich-text', options: { format: 'html' } },
  { name: 'code', type: 'code' },
  { name: 'count', type: 'number' },
  { name: 'enabled', type: 'boolean' },
  { name: 'date', type: 'date' },
  {
    name: 'status',
    type: 'select',
    options: { values: ['draft', 'published'] },
  },
  { name: 'image', type: 'image' },
  { name: 'file', type: 'file' },
  { name: 'reference', type: 'reference' },
  { name: 'uuid', type: 'uuid' },
]
const fields = [
  ...scalarFields,
  { name: 'details', type: 'object', fields: scalarFields },
  { name: 'rows', type: 'object', list: true, fields: scalarFields },
  {
    name: 'layout',
    type: 'block',
    list: true,
    blocks: [{ name: 'section', fields: scalarFields }],
  },
  {
    name: 'customBlock',
    type: 'block',
    blockKey: 'kind',
    blocks: [{ name: 'section', fields: scalarFields }],
  },
  { name: 'paragraphs', type: 'rich-text', list: true },
]
const scalar: JsonObject = {
  title: 'Entry title',
  text: 'Plain text\nSecond line',
  body: '**Markdown** body',
  html: '<p>HTML <strong>body</strong></p>',
  code: 'const answer = 42;',
  count: 0,
  enabled: false,
  date: '2026-10-12',
  status: 'published',
  image: '/images/image.png',
  file: '/images/file.txt',
  reference: 'other-entry',
  uuid: 'a13a268a-30cb-4fd4-8b27-8bb0daa388bf',
}
const content: JsonObject = {
  ...scalar,
  details: { ...scalar },
  rows: [{ ...scalar }, { ...scalar, title: 'New row' }],
  layout: [
    { ...scalar, _block: 'section' },
    { ...scalar, title: 'New block', _block: 'section' },
  ],
  customBlock: { ...scalar, kind: 'section' },
  paragraphs: ['First paragraph', '**New paragraph**'],
}

function setup(
  format: ContentFormat | 'raw',
  merge: boolean,
  rootList = false,
) {
  const files = new Map<string, { source: string; sha: string }>()
  const getFile = vi.fn(async (_owner: string, _repo: string, path: string) => {
    const file = files.get(path)
    if (!file) throw new Error(`Missing test file: ${path}`)
    return {
      sha: file.sha,
      content: Buffer.from(file.source).toString('base64'),
    }
  })
  const putFile = vi.fn(
    async (input: { path: string; content: string; sha?: string }) => {
      const sha = `saved-${files.size}-${Date.now()}`
      files.set(input.path, {
        source: Buffer.from(input.content, 'base64').toString('utf8'),
        sha,
      })
      return { path: input.path, sha, commitSha: 'commit-sha' }
    },
  )
  state.configuration = {
    settings: { content: { merge } },
    content: [
      {
        type: 'collection',
        name: 'entries',
        path: 'content',
        format,
        fields,
        ...(rootList ? { list: true } : {}),
        filename: 'created',
        filenameField: true,
      },
    ],
  }
  const input = {
    database: {} as Database,
    repositoryAccess: {
      resolve: vi
        .fn()
        .mockResolvedValue({ api: { getFile, putFile }, tokenSource: 'user' }),
    },
    user: {
      id: 'editor',
      email: 'editor@example.com',
      githubUsername: 'editor',
      name: 'Editor',
    },
    owner: 'owner',
    repo: 'repo',
    branch: 'main',
    name: 'entries',
  }
  return { input, files, putFile, getFile }
}

beforeEach(() => vi.clearAllMocks())

it('writes a raw template under the selected folder and authorizes the final localized path', async () => {
  const { input, files, putFile } = setup('raw', false)
  state.configuration = normalizeConfiguration({
    i18n: { locales: ['en', 'fr'] },
    content: [
      {
        type: 'collection',
        name: 'entries',
        path: 'content',
        filename: 'bundles/index.txt',
        i18n: {
          scheme: 'files',
          path: { type: 'filename', position: 'suffix' },
        },
      },
    ],
  })
  const request = {
    ...input,
    parent: 'content/archive',
    locale: 'fr',
    source: 'text',
  }
  const path = 'content/archive/bundles/index.fr.txt'
  const deny = vi.fn(async () => {
    throw new Error('Access denied')
  })
  await expect(
    createRawEntry({ ...request, authorizeWrite: deny }),
  ).rejects.toThrow('Access denied')
  expect(deny).toHaveBeenCalledWith(path)
  expect(putFile).not.toHaveBeenCalled()
  expect((await createRawEntry(request)).path).toBe(path)
  expect(files.get(path)?.source).toBe('text')
})

it.each([
  'nested/post.json',
  '/post.json',
  'a/../post.json',
  '../post.json',
  'a\\post.json',
])(
  'rejects manual create and rename paths %j before writing',
  async (filename) => {
    const { input, putFile } = setup('json', false)
    await expect(
      createStructuredEntry({ ...input, filename, content }),
    ).rejects.toThrow('without a folder path')
    await expect(
      createRawEntry({ ...input, filename, source: '{}' }),
    ).rejects.toThrow('without a folder path')
    await expect(
      renameContentEntry({
        ...input,
        filename,
        path: 'content/old.json',
        sha: 'sha',
      }),
    ).rejects.toThrow('without a folder path')
    expect(putFile).not.toHaveBeenCalled()
  },
)

describe('structured content persistence', () => {
  it('updates one file with one PUT and no branch-wide Git operations', async () => {
    const { input, files, putFile, getFile } = setup('json', false)
    files.set('content/example.json', {
      source: JSON.stringify(content),
      sha: 'original-file-sha',
    })
    const result = await saveStructuredEntry({
      ...input,
      path: 'content/example.json',
      sha: 'original-file-sha',
      content,
    })
    expect(input.repositoryAccess.resolve).toHaveBeenCalledTimes(1)
    expect(putFile).toHaveBeenCalledTimes(1)
    expect(putFile).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'content/example.json',
        sha: 'original-file-sha',
      }),
    )
    expect(getFile).not.toHaveBeenCalled()
    expect(result.entry).toEqual(
      await loadRawEntry({ ...input, path: result.path }),
    )
  })

  it('uses a custom message only when the repository allows it', async () => {
    const { input, putFile } = setup('json', false)
    await saveStructuredEntry({
      ...input,
      path: 'content/message.json',
      content,
      message: 'Custom audit message',
    })
    expect(putFile.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        message: expect.not.stringContaining('Custom audit message'),
      }),
    )
    state.configuration.settings = {
      commit: { allowCustomMessage: true },
      content: { merge: false },
    }
    await saveStructuredEntry({
      ...input,
      path: 'content/message.json',
      content,
      message: 'Custom audit message',
    })
    expect(putFile.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({ message: 'Custom audit message' }),
    )
  })

  it.each([
    'json',
    'yaml',
    'toml',
    'yaml-frontmatter',
    'json-frontmatter',
    'toml-frontmatter',
  ] as const)(
    'preserves all configured values in new and existing %s entries',
    async (format) => {
      for (const merge of [false, true]) {
        const { input, files } = setup(format, merge)
        const created = await createStructuredEntry({
          ...input,
          filename: 'created',
          content,
        })
        expect(input.repositoryAccess.resolve).toHaveBeenCalledTimes(1)
        const loaded = await loadRawEntry({ ...input, path: created.path })
        expect(created.entry).toEqual(loaded)
        expect(loaded.mode).toBe('structured')
        if (loaded.mode !== 'structured')
          throw new Error('Expected structured entry')
        expect(loaded.content).toEqual(content)
        expect(parseContent(loaded.source, { format })).toEqual(content)
        const changed = {
          ...content,
          body: 'Edited existing body',
          count: 5,
          enabled: true,
          layout: [
            { ...scalar, _block: 'section', body: 'Edited block' },
            {
              ...scalar,
              _block: 'section',
              body: 'New block after first save',
            },
          ],
        }
        await saveStructuredEntry({
          ...input,
          path: created.path,
          sha: loaded.sha,
          content: changed,
        })
        const reopened = await loadRawEntry({ ...input, path: created.path })
        if (reopened.mode !== 'structured')
          throw new Error('Expected structured entry')
        expect(reopened.content).toEqual(changed)
        expect(
          parseContent(files.get(created.path)!.source, { format }),
        ).toEqual(changed)
      }
    },
  )

  it.each(['json', 'yaml'] as const)(
    'preserves new and existing rows in root %s lists',
    async (format) => {
      const { input } = setup(format, true, true)
      const created = await createStructuredEntry({
        ...input,
        filename: 'list',
        content: [content],
      })
      const loaded = await loadRawEntry({ ...input, path: created.path })
      expect(loaded.mode).toBe('structured-list')
      if (loaded.mode !== 'structured-list')
        throw new Error('Expected structured list')
      await saveStructuredEntry({
        ...input,
        path: created.path,
        sha: loaded.sha,
        content: [content, { ...content, body: 'New root row' }],
      })
      const reopened = await loadRawEntry({ ...input, path: created.path })
      if (reopened.mode !== 'structured-list')
        throw new Error('Expected structured list')
      expect(reopened.content).toEqual([
        content,
        { ...content, body: 'New root row' },
      ])
    },
  )

  it('preserves unmanaged existing data with merge enabled while replacing block arrays', async () => {
    const { input, files } = setup('json', true)
    files.set('content/existing', {
      sha: 'old-sha',
      source: serializeContent(
        { ...content, unmanaged: 'Keep me' },
        { format: 'json' },
      ),
    })
    const changed = {
      ...content,
      layout: [{ ...scalar, _block: 'section', body: 'Replacement block' }],
    }
    await saveStructuredEntry({
      ...input,
      path: 'content/existing',
      sha: 'old-sha',
      content: changed,
    })
    expect(
      parseContent(files.get('content/existing')!.source, { format: 'json' }),
    ).toEqual({ ...changed, unmanaged: 'Keep me' })
  })
})

describe('localized content persistence', () => {
  function localized(localizedFields: unknown[], root = false, list = false) {
    const context = setup('json', false)
    state.configuration = normalizeConfiguration({
      i18n: { default: 'en', locales: ['en', 'fr'] },
      media: { input: 'public/images', output: '/images' },
      content: [
        {
          name: 'entries',
          type: 'collection',
          path: 'content',
          format: 'json',
          localized: root || undefined,
          list: list || undefined,
          i18n: { scheme: 'fields' },
          filename: '{primary}.json',
          filenameField: true,
          fields: localizedFields,
        },
      ],
    })
    return context
  }
  it('round trips localized media, empty values, unknown data and nested shared-list translations', async () => {
    const { input, files } = localized([
      { name: 'title', type: 'string', localized: true },
      { name: 'image', type: 'image', localized: true },
      { name: 'body', type: 'rich-text', localized: true },
      {
        name: 'rows',
        type: 'object',
        list: true,
        fields: [{ name: 'text', type: 'string', localized: true }],
      },
    ])
    const data = {
      title: { en: 'Hello', fr: '', xx: 'Keep' },
      image: { en: '/images/a.png' },
      body: { en: '![A](/images/a.png)', fr: '![A](/images/a.png)' },
      rows: [
        { text: { en: 'One', fr: 'Un' }, extra: 0 },
        { text: { en: 'Two', fr: 'Deux' } },
      ],
      unknown: false,
    }
    files.set('content/a.json', { source: JSON.stringify(data), sha: 'old' })
    const loaded = await loadRawEntry({ ...input, path: 'content/a.json' })
    if (loaded.mode === 'raw') throw new Error('Expected structured content')
    expect(loaded.content).toMatchObject({
      image: { en: 'public/images/a.png' },
      title: data.title,
    })
    const next = loaded.content as JsonObject
    next.rows = [...(next.rows as JsonObject[])].reverse()
    await saveStructuredEntry({
      ...input,
      path: 'content/a.json',
      sha: 'old',
      content: next,
    })
    expect(JSON.parse(files.get('content/a.json')!.source)).toEqual({
      ...data,
      rows: [data.rows[1], data.rows[0]],
    })
  })
  it.each([false, true])(
    'round trips a localized root (list=%s)',
    async (list) => {
      const { input, files } = localized(
        [{ name: 'title', type: 'string' }],
        true,
        list,
      )
      const data = list
        ? { en: [{ title: 'One', hidden: 0 }], fr: [], extra: { keep: true } }
        : {
            en: { title: 'Hello' },
            fr: { title: 'Bonjour' },
            extra: { keep: true },
          }
      files.set('content/a.json', { source: JSON.stringify(data), sha: 'old' })
      const loaded = await loadRawEntry({ ...input, path: 'content/a.json' })
      if (loaded.mode === 'raw') throw new Error('Expected structured content')
      expect(loaded.content).toEqual(data)
      await saveStructuredEntry({
        ...input,
        path: 'content/a.json',
        sha: 'old',
        content: loaded.content,
      })
      expect(JSON.parse(files.get('content/a.json')!.source)).toEqual(data)
    },
  )
  it('creates non-Latin filenames from the active locale', async () => {
    const { input, files } = localized([
      { name: 'title', type: 'string', localized: true },
    ])
    const result = await createStructuredEntry({
      ...input,
      locale: 'fr',
      content: { title: { fr: '你好' } },
    })
    expect(result.path).toBe('content/你好.json')
    expect(JSON.parse(files.get(result.path)!.source)).toEqual({
      title: { fr: '你好' },
    })
  })
  it('rejects malformed locale maps before writing, retaining them on read', async () => {
    const { input, files, putFile } = localized([
      { name: 'title', type: 'string', localized: true },
    ])
    files.set('content/a.json', { source: '{"title":null}', sha: 'old' })
    const loaded = await loadRawEntry({ ...input, path: 'content/a.json' })
    if (loaded.mode === 'raw') throw new Error('Expected structured content')
    expect(loaded.content).toEqual({ title: null })
    await expect(
      saveStructuredEntry({
        ...input,
        path: 'content/a.json',
        sha: 'old',
        content: loaded.content,
      }),
    ).rejects.toThrow(/keyed by locale/)
    expect(putFile).not.toHaveBeenCalled()
  })
})
