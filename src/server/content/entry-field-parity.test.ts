import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import * as registry from '#/fields/registry'
import { saveStructuredEntry } from './entry-editor'
import type { Database } from '#/server/db/client'
import type { RepositoryAccessService } from '#/server/access/repository'

const mocks = vi.hoisted(() => ({
  getConfiguration: vi.fn(),
  putFile: vi.fn(),
  getFile: vi.fn(),
}))
vi.mock('#/server/cache/configuration', () => ({
  createConfigurationStore: () => ({ get: mocks.getConfiguration }),
}))
vi.mock('#/server/cache/repository', () => ({
  updateRepositoryCacheAfterMutation: vi.fn(),
}))

const fields = [
  { name: 'title', type: 'string' },
  { name: 'date', type: 'date', options: { format: 'dd/MM/yyyy' } },
  { name: 'tags', type: 'string', list: true },
]
const schema = {
  name: 'test',
  type: 'file',
  path: 'content/test.json',
  format: 'json',
  fields,
}
const input = {
  database: {} as Database,
  repositoryAccess: {
    resolve: async () => ({
      api: { putFile: mocks.putFile, getFile: mocks.getFile },
    }),
  } as unknown as RepositoryAccessService,
  owner: 'pagescms',
  repo: 'Test',
  branch: 'main',
  name: 'test',
  path: 'content/test.json',
  sha: 'sha-1',
  user: {
    id: 'user',
    email: 'user@example.com',
    name: 'User',
    githubUsername: null,
  },
  content: {
    title: 'New',
    date: '2026-10-02',
    tags: [],
    unmanaged: 'stale client value',
  },
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.putFile.mockResolvedValue({ sha: 'sha-2', commitSha: 'commit' })
  mocks.getFile.mockResolvedValue({
    content: btoa(
      JSON.stringify({
        title: 'Old',
        date: '01/10/2026',
        tags: ['old'],
        unmanaged: 'fresh server value',
      }),
    ),
  })
})
afterEach(() => vi.restoreAllMocks())

describe('structured persistence parity', () => {
  it('passes nested custom values and configuration through validation and write hooks before PUT', async () => {
    const write = vi.fn(
      (value, field, config) => `${config.marker}:${field.name}:${value}`,
    )
    vi.spyOn(registry, 'customFieldDefinition').mockImplementation((type) =>
      type === 'number'
        ? {
            schema: () => z.string().transform((value) => value.toLowerCase()),
            write,
          }
        : undefined,
    )
    const field = { name: 'value', type: 'number', list: true }
    const configuration = {
      marker: 'repository',
      content: [
        {
          ...schema,
          fields: [{ name: 'nested', type: 'object', fields: [field] }],
        },
      ],
    }
    mocks.getConfiguration.mockResolvedValue({ object: configuration })
    await saveStructuredEntry({
      ...input,
      content: { nested: { value: ['CUSTOM'] } },
    })
    expect(write).toHaveBeenCalledWith('custom', field, configuration)
    expect(JSON.parse(atob(mocks.putFile.mock.calls[0][0].content))).toEqual({
      nested: { value: ['repository:value:custom'] },
    })
  })
  it('writes configured date formats and removes unmanaged keys by default', async () => {
    mocks.getConfiguration.mockResolvedValue({
      object: { content: [schema], settings: {} },
    })
    await saveStructuredEntry(input)
    const saved = JSON.parse(atob(mocks.putFile.mock.calls[0][0].content))
    expect(saved).toEqual({ title: 'New', date: '02/10/2026' })
    expect(mocks.getFile).not.toHaveBeenCalled()
  })
  it('reads existing server content for merge and replaces cleared arrays', async () => {
    mocks.getConfiguration.mockResolvedValue({
      object: { content: [schema], settings: { content: { merge: true } } },
    })
    await saveStructuredEntry(input)
    const saved = JSON.parse(atob(mocks.putFile.mock.calls[0][0].content))
    expect(saved).toEqual({
      title: 'New',
      date: '02/10/2026',
      tags: [],
      unmanaged: 'fresh server value',
    })
    expect(mocks.getFile).toHaveBeenCalledExactlyOnceWith(
      'pagescms',
      'Test',
      'content/test.json',
      'main',
    )
  })

  it('does not restore cleared configured fields when merging an object', async () => {
    const navigation = {
      name: 'navigation',
      type: 'object',
      fields: [
        { name: 'key', type: 'string' },
        { name: 'parent', type: 'string' },
      ],
    }
    mocks.getConfiguration.mockResolvedValue({
      object: {
        content: [{ ...schema, fields: [navigation] }],
        settings: { content: { merge: true } },
      },
    })
    mocks.getFile.mockResolvedValue({
      content: btoa(
        JSON.stringify({
          navigation: { key: 'old', parent: 'old parent', extra: 'keep' },
          unrelated: 'keep',
        }),
      ),
    })
    await saveStructuredEntry({ ...input, content: { navigation: {} } })
    expect(JSON.parse(atob(mocks.putFile.mock.calls[0][0].content))).toEqual({
      navigation: { extra: 'keep' },
      unrelated: 'keep',
    })
  })

  it('removes a cleared object while retaining other unmanaged fields', async () => {
    const navigation = {
      name: 'navigation',
      type: 'object',
      fields: [{ name: 'key', type: 'string' }],
    }
    mocks.getConfiguration.mockResolvedValue({
      object: {
        content: [{ ...schema, fields: [navigation] }],
        settings: { content: { merge: true } },
      },
    })
    mocks.getFile.mockResolvedValue({
      content: btoa(
        JSON.stringify({ navigation: { key: 'old' }, unrelated: 'keep' }),
      ),
    })
    await saveStructuredEntry({ ...input, content: {} })
    expect(JSON.parse(atob(mocks.putFile.mock.calls[0][0].content))).toEqual({
      unrelated: 'keep',
    })
  })

  it('keeps a cleared navigation object cleared in Markdown front matter', async () => {
    const navigation = {
      name: 'eleventyNavigation',
      type: 'object',
      fields: [{ name: 'key', type: 'string' }],
    }
    mocks.getConfiguration.mockResolvedValue({
      object: {
        content: [
          {
            ...schema,
            path: 'content/test.md',
            format: 'yaml-frontmatter',
            fields: [navigation, { name: 'body', type: 'rich-text' }],
          },
        ],
        settings: { content: { merge: true } },
      },
    })
    mocks.getFile.mockResolvedValue({
      content: btoa(
        '---\neleventyNavigation:\n  key: Old\nunmanaged: Keep\n---\nBody',
      ),
    })
    await saveStructuredEntry({
      ...input,
      path: 'content/test.md',
      content: { eleventyNavigation: {}, body: 'Body' },
    })
    const saved = atob(mocks.putFile.mock.calls[0][0].content)
    expect(saved).not.toContain('Old')
    expect(saved).toContain('unmanaged: Keep')
    expect(saved).toContain('Body')
  })
  it('rejects invalid named select values before writing', async () => {
    mocks.getConfiguration.mockResolvedValue({
      object: {
        content: [
          {
            ...schema,
            fields: [
              {
                name: 'status',
                type: 'select',
                options: { values: [{ name: 'draft', label: 'Draft' }] },
              },
            ],
          },
        ],
      },
    })
    await expect(
      saveStructuredEntry({ ...input, content: { status: 'invalid' } }),
    ).rejects.toThrow(/configured option/)
    expect(mocks.putFile).not.toHaveBeenCalled()
  })
})

describe('field validation before sanitization', () => {
  it.each([false, true])(
    'rejects an explicitly cleared minimum list before PUT (merge=%s)',
    async (merge) => {
      mocks.getConfiguration.mockResolvedValue({
        object: {
          content: [
            {
              ...schema,
              fields: [{ name: 'items', type: 'number', list: { min: 1 } }],
            },
          ],
          settings: { content: { merge } },
        },
      })
      await expect(
        saveStructuredEntry({ ...input, content: { items: [] } }),
      ).rejects.toThrow(/requires at least 1/)
      await expect(
        saveStructuredEntry({ ...input, content: { items: [null] } }),
      ).rejects.toThrow(/is empty/)
      expect(mocks.putFile).not.toHaveBeenCalled()
      expect(mocks.getFile).not.toHaveBeenCalled()
    },
  )
  it('reports all nested field paths together and never writes invalid values', async () => {
    mocks.getConfiguration.mockResolvedValue({
      object: {
        content: [
          {
            ...schema,
            fields: [
              {
                name: 'sections',
                type: 'object',
                list: true,
                fields: [
                  { name: 'title', type: 'string', required: true },
                  { name: 'count', type: 'number' },
                ],
              },
            ],
          },
        ],
      },
    })
    try {
      await saveStructuredEntry({
        ...input,
        content: { sections: [{ title: '', count: 'invalid' }] },
      })
      expect.fail('Invalid save succeeded')
    } catch (error) {
      const { fieldValidationIssues } =
        await import('#/shared/field-validation-error')
      expect(fieldValidationIssues(error)?.map((issue) => issue.path)).toEqual([
        'sections.0.title',
        'sections.0.count',
      ])
    }
    expect(mocks.putFile).not.toHaveBeenCalled()
  })
})
