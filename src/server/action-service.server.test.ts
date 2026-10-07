import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadRepositoryActions } from './action-service.server'
import type { Database } from './database/client.server'

const configuration = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('./configuration-store.server', () => ({
  createConfigurationStore: () => configuration,
}))

describe('repository action discovery', () => {
  beforeEach(() => {
    configuration.get.mockResolvedValue({
      object: {
        actions: [{ name: 'deploy', label: 'Deploy', workflow: 'deploy.yml' }],
      },
    })
  })

  it('authorizes and lists configured actions without reading or synchronizing runs', async () => {
    const select = vi.fn()
    const resolve = vi.fn().mockResolvedValue({ api: {} })
    const result = await loadRepositoryActions({
      database: { select } as unknown as Database,
      cacheDatabase: {} as Database,
      repositoryAccess: { resolve },
      user: {
        id: 'owner',
        name: 'Owner',
        email: 'owner@example.com',
        githubUsername: 'owner',
      },
      owner: 'pagescms',
      repo: 'test',
      branch: 'main',
      includeRuns: false,
    })
    expect(result.actions).toMatchObject([
      { name: 'deploy', workflow: 'deploy.yml' },
    ])
    expect(result.runs).toEqual([])
    expect(resolve).toHaveBeenCalledOnce()
    expect(select).not.toHaveBeenCalled()
  })

  it('does not bypass repository access when runs are omitted', async () => {
    await expect(
      loadRepositoryActions({
        database: {} as Database,
        cacheDatabase: {} as Database,
        repositoryAccess: {
          resolve: vi.fn().mockRejectedValue(new Error('Access denied')),
        },
        user: {
          id: 'owner',
          name: 'Owner',
          email: 'owner@example.com',
          githubUsername: 'owner',
        },
        owner: 'pagescms',
        repo: 'test',
        branch: 'main',
        includeRuns: false,
      }),
    ).rejects.toThrow('Access denied')
  })
})
