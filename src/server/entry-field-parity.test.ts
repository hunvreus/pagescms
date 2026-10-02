import { beforeEach, describe, expect, it, vi } from 'vitest'
import { saveStructuredEntry } from './entry-editor.server'
import type { Database } from './database/client.server'
import type { RepositoryAccessService } from './repository-access.server'

const mocks = vi.hoisted(() => ({
  getConfiguration: vi.fn(),
  putFile: vi.fn(),
  getFile: vi.fn(),
}))
vi.mock('./configuration-store.server', () => ({
  createConfigurationStore: () => ({ get: mocks.getConfiguration }),
}))
vi.mock('./repository-cache.server', () => ({
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

describe('structured persistence parity', () => {
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
    expect(mocks.getFile).toHaveBeenCalledTimes(1)
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
