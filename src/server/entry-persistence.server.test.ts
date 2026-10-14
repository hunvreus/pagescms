import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ContentFormat } from '#/lib/content-serialization'
import type { JsonObject } from '#/lib/json'
import type { Database } from './database/client.server'
import { parseContent, serializeContent } from '#/lib/content-serialization'
import {
  createStructuredEntry,
  loadRawEntry,
  saveStructuredEntry,
} from './entry-editor.server'

const state = vi.hoisted((): { configuration: Record<string, unknown> } => ({
  configuration: {},
}))
vi.mock('./configuration-store.server', () => ({
  createConfigurationStore: () => ({
    get: async () => ({ object: state.configuration }),
  }),
}))
vi.mock('./repository-cache.server', () => ({
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

function setup(format: ContentFormat, merge: boolean, rootList = false) {
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
