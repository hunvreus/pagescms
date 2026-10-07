import { describe, expect, it, vi } from 'vitest'
import { collaboratorApi } from './collaborator-api.server'
import { isDeploymentAdmin } from './admin-access.server'
import { createBranch } from './branch-service.server'
import {
  loadConfigurationSource,
  saveConfigurationSource,
} from './configuration-editor.server'
import {
  dispatchRepositoryAction,
  manageRepositoryAction,
} from './action-service.server'
import type { GitHubApi } from './github-api.server'
import type { Database } from './database/client.server'

const user = {
  id: 'editor',
  name: 'Editor',
  email: 'editor@example.com',
  emailVerified: true,
  githubUsername: 'linked-github-user',
}
const coordinates = { owner: 'owner', repo: 'repo', branch: 'main' }

it('requires verified ownership of an allowlisted admin email', () => {
  expect(
    isDeploymentAdmin({ email: 'ADMIN@example.com', emailVerified: true }, [
      'admin@example.com',
    ]),
  ).toBe(true)
  expect(
    isDeploymentAdmin({ email: 'admin@example.com', emailVerified: false }, [
      'admin@example.com',
    ]),
  ).toBe(false)
  expect(
    isDeploymentAdmin({ email: 'admin@example.com' }, ['admin@example.com']),
  ).toBe(false)
  expect(
    isDeploymentAdmin({ email: 'other@example.com', emailVerified: true }, [
      'admin@example.com',
    ]),
  ).toBe(false)
})

describe('collaborator configuration confinement', () => {
  it('blocks writes, deletes, and renames targeting config through any content API', async () => {
    const remote = {
      putFile: vi.fn(),
      deleteFile: vi.fn(),
      renameFile: vi.fn(),
    } as unknown as GitHubApi
    const api = collaboratorApi(remote)
    await expect(
      api.putFile({
        ...coordinates,
        path: '/.pages.yml',
        content: '',
        message: '',
      }),
    ).rejects.toThrow('cannot change')
    await expect(
      api.deleteFile({
        ...coordinates,
        path: '.pages.yml',
        sha: 'sha',
        message: '',
      }),
    ).rejects.toThrow('cannot change')
    for (const [path, newPath] of [
      ['.pages.yml', 'old.yml'],
      ['new.yml', '.pages.yml'],
    ]) {
      await expect(
        api.renameFile({
          ...coordinates,
          path,
          newPath,
          sha: 'sha',
          message: '',
        }),
      ).rejects.toThrow('cannot change')
    }
    expect(remote.putFile).not.toHaveBeenCalled()
    expect(remote.deleteFile).not.toHaveBeenCalled()
    expect(remote.renameFile).not.toHaveBeenCalled()
    await api.putFile({
      ...coordinates,
      path: 'posts/article.md',
      content: '',
      message: '',
    })
    expect(remote.putFile).toHaveBeenCalledOnce()
  })

  it.each(['installation', 'readonly'])(
    'rejects config-editor and workflow mutations for %s access',
    async (kind) => {
      const getRepository = vi.fn().mockResolvedValue({ canPush: false })
      const repositoryAccess = {
        resolve: vi.fn().mockResolvedValue({
          tokenSource: kind === 'installation' ? 'installation' : 'user',
          api: { getRepository },
        }),
      }
      const input = {
        ...coordinates,
        user,
        repositoryAccess,
        database: {} as Database,
        cacheDatabase: {} as Database,
      }
      await expect(
        saveConfigurationSource({ ...input, source: 'content: []', sha: null }),
      ).rejects.toThrow(/write access/)
      await expect(
        dispatchRepositoryAction({
          ...input,
          actionName: 'deploy',
          inputs: {},
          context: { type: 'repository', name: null, path: null, data: {} },
        }),
      ).rejects.toThrow(/write access/)
      await expect(
        manageRepositoryAction({ ...input, runId: 1, intent: 'rerun' }),
      ).rejects.toThrow(/write access/)
      if (kind === 'installation') expect(getRepository).not.toHaveBeenCalled()
    },
  )

  it('preserves admitted configuration reads without granting writes', async () => {
    const getFile = vi
      .fn()
      .mockResolvedValue({ content: btoa('content: []'), sha: 'sha' })
    const repositoryAccess = {
      resolve: vi
        .fn()
        .mockResolvedValue({ tokenSource: 'installation', api: { getFile } }),
    }
    await expect(
      loadConfigurationSource({ ...coordinates, user, repositoryAccess }),
    ).resolves.toEqual({ source: 'content: []', sha: 'sha' })
  })
})

describe('branch creation confinement', () => {
  it('checks both source and destination before writing', async () => {
    const write = vi.fn()
    const resolve = vi
      .fn()
      .mockResolvedValueOnce({
        api: { createBranch: write },
        tokenSource: 'installation',
      })
      .mockRejectedValueOnce(new Error('Destination denied'))
    await expect(
      createBranch({ resolve }, user, {
        ...coordinates,
        source: 'main',
        branch: 'other',
      }),
    ).rejects.toThrow('Destination denied')
    expect(resolve.mock.calls.map((call) => call[3])).toEqual(['main', 'other'])
    expect(write).not.toHaveBeenCalled()
  })
})
