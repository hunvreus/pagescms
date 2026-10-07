import { describe, it, expect, vi } from 'vitest'
import { moveContentEntry } from './entry-editor.server'
import type { Database } from './database/client.server'

const configuration = vi.hoisted(() => ({
  object: {
    content: [
      { type: 'collection', name: 'posts', path: 'posts', extension: 'md' },
      {
        type: 'file',
        name: 'settings',
        path: 'data/settings.json',
        extension: 'json',
      },
    ],
  },
}))
vi.mock('./configuration-store.server', () => ({
  createConfigurationStore: () => ({ get: async () => configuration }),
}))
describe('content move boundaries', () => {
  const renameFile = vi.fn()
  const input = {
    database: {} as Database,
    repositoryAccess: {
      resolve: vi.fn().mockResolvedValue({
        api: { renameFile },
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
