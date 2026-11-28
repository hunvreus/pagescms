import { describe, it, expect, vi } from 'vitest'
import {
  loadEntryHistory,
  loadFixedFile,
  loadRawEntry,
  moveContentEntry,
} from './entry-editor'
import type { Database } from '#/server/db/client'

const configuration = vi.hoisted(() => ({
  object: {
    content: [
      { type: 'collection', name: 'posts', path: 'posts', extension: 'md' },
      { type: 'collection', name: 'root', path: '', extension: 'md' },
      {
        type: 'file',
        name: 'settings',
        path: 'data/settings.json',
        extension: 'json',
      },
    ],
  },
}))
vi.mock('#/server/cache/configuration', () => ({
  createConfigurationStore: () => ({ get: async () => configuration }),
}))
describe('content move boundaries', () => {
  const renameFile = vi.fn()
  const listFileCommits = vi.fn().mockResolvedValue([])
  const input = {
    database: {} as Database,
    repositoryAccess: {
      resolve: vi.fn().mockResolvedValue({
        api: { renameFile, listFileCommits },
        tokenSource: 'installation',
      }),
    },
    user: {
      id: 'collaborator',
      email: 'editor@example.com',
      githubUsername: null,
      name: 'Editor',
    },
    owner: 'owner',
    repo: 'repo',
    branch: 'main',
    name: 'posts',
    path: 'posts/example.md',
    sha: 'sha',
  }
  it('passes the history page for the resolved entry path', async () => {
    await expect(loadEntryHistory({ ...input, page: 2 })).resolves.toEqual([])
    expect(listFileCommits).toHaveBeenCalledWith(
      'owner',
      'repo',
      'main',
      'posts/example.md',
      2,
    )
  })
  it('keeps the pinned repository ID for entry, fixed-file and history reads', async () => {
    const resolve = vi
      .fn()
      .mockRejectedValue(new Error('Repository identity changed'))
    const scoped = { ...input, repoId: '42', repositoryAccess: { resolve } }
    for (const read of [
      () => loadRawEntry(scoped),
      () => loadFixedFile({ ...scoped, name: 'settings' }),
      () => loadEntryHistory(scoped),
    ])
      await expect(read()).rejects.toThrow('Repository identity changed')
    expect(resolve).toHaveBeenCalledTimes(3)
    for (const call of resolve.mock.calls) expect(call[4]).toBe('42')
  })
  it('reads entries in repository-root collections without allowing traversal', async () => {
    await expect(
      loadEntryHistory({
        ...input,
        name: 'root',
        path: 'nested/post.md',
        page: 1,
      }),
    ).resolves.toEqual([])
    expect(listFileCommits).toHaveBeenLastCalledWith(
      'owner',
      'repo',
      'main',
      'nested/post.md',
      1,
    )
    await expect(
      loadEntryHistory({
        ...input,
        name: 'root',
        path: '../private.md',
        page: 1,
      }),
    ).rejects.toThrow()
  })
  it('rejects moving outside the source collection before calling GitHub', async () => {
    await expect(
      moveContentEntry({ ...input, newPath: 'drafts/example.md' }),
    ).rejects.toThrow('outside its configured content root')
    await expect(
      moveContentEntry({ ...input, newPath: 'posts/example.json' }),
    ).rejects.toThrow('extension does not match')
    expect(renameFile).not.toHaveBeenCalled()
  })
  it('never allows a fixed file to be moved or renamed', async () => {
    await expect(
      moveContentEntry({
        ...input,
        name: 'settings',
        path: 'data/settings.json',
        newPath: 'data/other.json',
      }),
    ).rejects.toThrow('Renaming this content is disabled')
    expect(renameFile).not.toHaveBeenCalled()
  })
})
