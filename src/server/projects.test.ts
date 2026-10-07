import { describe, expect, it, vi } from 'vitest'

import {
  createProjectService,
  mergeProjectAccounts,
  mergeProjectRepositories,
} from './projects.server'

import type { Database } from './database/client.server'
import type { GitHubApi, GitHubApiFactory } from './github-api.server'
import type { RepositoryAccessService } from './repository-access.server'

describe('mergeProjectAccounts', () => {
  it('deduplicates collaborator access behind GitHub installations', () => {
    expect(
      mergeProjectAccounts(
        [
          {
            id: 42,
            repositorySelection: 'all',
            account: { login: 'PagesCMS', type: 'Organization' },
          },
        ],
        [
          {
            login: 'pagescms',
            type: 'org',
            repositorySelection: 'selected',
            installationId: 42,
          },
        ],
      ),
    ).toEqual([
      {
        login: 'PagesCMS',
        type: 'org',
        repositorySelection: 'all',
        installationId: 42,
      },
    ])
  })
})

describe('createProjectService', () => {
  it('checks the selected branch without enumerating the branch picker', async () => {
    const update = vi.fn().mockResolvedValue(undefined)
    const database = {
      insert: () => ({ values: () => ({ onConflictDoUpdate: update }) }),
    } as unknown as Database
    const api = {
      getRepository: vi.fn().mockResolvedValue({ defaultBranch: 'main' }),
      branchExists: vi.fn().mockResolvedValue(true),
      listBranches: vi.fn(),
    }
    const access = {
      resolve: vi.fn().mockResolvedValue({ api }),
    } as unknown as RepositoryAccessService
    // No selected branch also means no configuration lookup is necessary.
    const service = createProjectService(database, database, access)
    await expect(
      service.openRepository(
        { id: 'user', email: 'user@example.com', githubUsername: 'user' },
        'owner',
        'repo',
      ),
    ).resolves.toMatchObject({ branchExists: true, branches: ['main'] })
    expect(api.listBranches).not.toHaveBeenCalled()
    expect(api.branchExists).not.toHaveBeenCalled()
    expect(update).toHaveBeenCalledOnce()
  })
  it('uses a linked GitHub token even when the cached username is missing', async () => {
    const where = vi.fn(async () => [])
    const database = {
      query: {
        accountTable: {
          findFirst: vi.fn(async () => ({ accessToken: 'github-token' })),
        },
      },
      selectDistinct: vi.fn(() => ({
        from: vi.fn(() => ({ where })),
      })),
    } as unknown as Database
    const listInstallations = vi.fn(async () => [
      {
        id: 42,
        repositorySelection: 'all' as const,
        account: { login: 'PagesCMS', type: 'Organization' as const },
      },
    ])
    const githubApiFactory = vi.fn(
      () => ({ listInstallations }) as unknown as GitHubApi,
    ) as unknown as GitHubApiFactory
    const service = createProjectService(
      database,
      database,
      {} as RepositoryAccessService,
      githubApiFactory,
    )

    await expect(
      service.listAccounts({
        id: 'user-1',
        email: 'user@example.com',
        githubUsername: null,
      }),
    ).resolves.toMatchObject([{ login: 'PagesCMS', installationId: 42 }])
    expect(listInstallations).toHaveBeenCalledOnce()
  })
})

describe('mergeProjectRepositories', () => {
  it('orders writable repositories by most recently updated first', () => {
    expect(
      mergeProjectRepositories(
        [
          {
            owner: 'PagesCMS',
            name: 'older',
            private: false,
            defaultBranch: 'main',
            updatedAt: '2026-08-20T00:00:00Z',
            canPush: true,
          },
          {
            owner: 'PagesCMS',
            name: 'newer',
            private: false,
            defaultBranch: 'main',
            updatedAt: '2026-08-21T00:00:00Z',
            canPush: true,
          },
        ],
        [],
      ).map((repository) => repository.repo),
    ).toEqual(['newer', 'older'])
  })

  it('filters read-only GitHub repositories and preserves collaborator access', () => {
    expect(
      mergeProjectRepositories(
        [
          {
            owner: 'PagesCMS',
            name: 'writable',
            private: false,
            defaultBranch: 'main',
            updatedAt: '2026-08-20T00:00:00Z',
            canPush: true,
          },
          {
            owner: 'PagesCMS',
            name: 'read-only',
            private: false,
            defaultBranch: 'main',
            updatedAt: '2026-08-21T00:00:00Z',
            canPush: false,
          },
        ],
        [
          {
            owner: 'Other',
            repo: 'shared',
            private: true,
            defaultBranch: 'drafts',
            updatedAt: null,
          },
        ],
      ),
    ).toEqual([
      {
        owner: 'PagesCMS',
        repo: 'writable',
        private: false,
        defaultBranch: 'main',
        updatedAt: '2026-08-20T00:00:00Z',
      },
      {
        owner: 'Other',
        repo: 'shared',
        private: true,
        defaultBranch: 'drafts',
        updatedAt: null,
      },
    ])
  })
})
