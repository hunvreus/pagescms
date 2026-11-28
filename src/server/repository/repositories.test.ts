import { createRepositoryService } from '../__tests__/credentials'
import type * as RepositoryIdentityModule from '#/server/access/repository-identity'
import { describe, expect, it, vi } from 'vitest'

import {
  mergeRepositoryAccounts,
  mergeRepositoryRepositories,
} from './repositories'

import type { Database } from '#/server/db/client'
import type { GitHubApi, GitHubApiFactory } from '#/server/github/api'
import type { RepositoryAccessService } from '#/server/access/repository'

describe('mergeProjectAccounts', () => {
  it('deduplicates collaborator access behind GitHub installations', () => {
    expect(
      mergeRepositoryAccounts(
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

describe('createRepositoryService', () => {
  it('shows up to five editable repositories from ten search results', async () => {
    const database = {
      $client: { execute: vi.fn(async () => ({ rows: [] })) },
      query: {
        accountTable: {
          findFirst: vi.fn(async () => ({ accessToken: 'token' })),
        },
      },
    } as unknown as Database
    const results = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      owner: 'owner',
      name: `repo${i}`,
      defaultBranch: 'main',
      updatedAt: null,
      canPush: i >= 2,
      private: false,
    }))
    const service = createRepositoryService(
      database,
      database,
      {} as RepositoryAccessService,
      (() => ({
        searchRepositories: async () => results,
      })) as unknown as GitHubApiFactory,
    )
    const found = await service.listRepositories(
      { id: 'user', email: 'user@example.com', githubUsername: 'user' },
      {
        login: 'owner',
        installationId: 1,
        repositorySelection: 'all',
        type: 'user',
      },
      '',
    )
    expect(found.map((repository) => repository.repo)).toEqual([
      'repo2',
      'repo3',
      'repo4',
      'repo5',
      'repo6',
    ])
  })

  it.each([
    { repositorySelection: 'all', type: 'user' },
    { repositorySelection: 'all', type: 'org' },
    { repositorySelection: 'selected', type: 'org' },
  ] as const)(
    'uses the previous discovery path for $type accounts with $repositorySelection repositories',
    async ({ repositorySelection, type }) => {
      const database = {
        $client: { execute: vi.fn(async () => ({ rows: [] })) },
        query: {
          accountTable: {
            findFirst: vi.fn(async () => ({ accessToken: 'github-token' })),
          },
        },
      } as unknown as Database
      const repositories = [
        {
          id: 50,
          ownerId: 51,
          owner: 'PagesCMS',
          name: 'project',
          defaultBranch: 'main',
          updatedAt: '2026-08-20T00:00:00Z',
          canPush: true,
          private: false,
        },
      ]
      const api = {
        searchRepositories: vi.fn(async () => repositories),
        listInstallationRepositories: vi.fn(async () => repositories),
      }
      const githubApiFactory = vi.fn(() => api) as unknown as GitHubApiFactory
      const service = createRepositoryService(
        database,
        database,
        {} as RepositoryAccessService,
        githubApiFactory,
      )
      await expect(
        service.listRepositories(
          { id: 'user', email: 'user@example.com', githubUsername: 'user' },
          { login: 'PagesCMS', installationId: 42, repositorySelection, type },
          'search terms',
        ),
      ).resolves.toMatchObject([{ owner: 'PagesCMS', repo: 'project' }])
      expect(githubApiFactory).toHaveBeenCalledWith('github-token')
      if (repositorySelection === 'all') {
        expect(api.searchRepositories).toHaveBeenCalledExactlyOnceWith({
          owner: 'PagesCMS',
          type,
          keyword: 'search terms',
        })
        expect(api.listInstallationRepositories).not.toHaveBeenCalled()
      } else {
        expect(
          api.listInstallationRepositories,
        ).toHaveBeenCalledExactlyOnceWith(42)
        expect(api.searchRepositories).not.toHaveBeenCalled()
      }
    },
  )

  it('checks the selected branch without enumerating the branch picker', async () => {
    const update = vi.fn().mockResolvedValue({ rows: [] })
    const database = { $client: { execute: update } } as unknown as Database
    const api = {
      getRepository: vi.fn().mockResolvedValue({
        id: 10,
        ownerId: 20,
        owner: 'owner',
        repo: 'repo',
        defaultBranch: 'main',
        canPush: true,
        private: false,
      }),
      branchExists: vi.fn().mockResolvedValue(true),
      listBranches: vi.fn(),
    }
    const access = {
      resolve: vi.fn().mockResolvedValue({ api }),
    } as unknown as RepositoryAccessService
    // No selected branch also means no configuration lookup is necessary.
    const service = createRepositoryService(database, database, access)
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
    const database = {
      query: {
        accountTable: {
          findFirst: vi.fn(async () => ({
            id: 'github-account',
            accessToken: 'github-token',
          })),
        },
      },
      $client: { execute: vi.fn(async () => ({ rows: [] })) },
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
    const service = createRepositoryService(
      database,
      database,
      {} as RepositoryAccessService,
      githubApiFactory,
    )

    await expect(
      service.getAccountAccess({
        id: 'user-1',
        email: 'user@example.com',
        githubUsername: null,
      }),
    ).resolves.toMatchObject({
      accounts: [{ login: 'PagesCMS', installationId: 42 }],
      githubAccountId: 'github-account',
    })
    expect(listInstallations).toHaveBeenCalledOnce()
    expect(database.query.accountTable.findFirst).toHaveBeenCalledOnce()
  })
  it('does not treat a retained GitHub username as a connected account', async () => {
    const database = {
      query: { accountTable: { findFirst: vi.fn(async () => undefined) } },
      $client: { execute: vi.fn(async () => ({ rows: [] })) },
    } as unknown as Database
    const githubApiFactory = vi.fn() as unknown as GitHubApiFactory
    const service = createRepositoryService(
      database,
      database,
      {} as RepositoryAccessService,
      githubApiFactory,
    )
    await expect(
      service.getAccountAccess({
        id: 'disconnected',
        email: 'user@example.com',
        githubUsername: 'old-login',
      }),
    ).resolves.toEqual({ accounts: [], githubAccountId: null })
    expect(githubApiFactory).not.toHaveBeenCalled()
  })
})

describe('mergeProjectRepositories', () => {
  it('orders writable repositories by most recently updated first', () => {
    expect(
      mergeRepositoryRepositories(
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
      mergeRepositoryRepositories(
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

vi.mock('#/server/access/repository-identity', async (original) => ({
  ...(await original<typeof RepositoryIdentityModule>()),
  findRepositoryIdentityById: async () => ({
    id: 1,
    externalId: '10',
    ownerId: '20',
    source: 'github.com',
    owner: 'owner',
    repo: 'repo',
  }),
  findRepositoryIdentity: async (
    _database: unknown,
    address: { owner: string; repo: string },
  ) => ({
    id: 1,
    externalId: '10',
    ownerId: '20',
    source: 'github.com',
    ...address,
  }),
  ensureRepositoryIdentity: async (
    _database: unknown,
    address: { owner: string; repo: string },
  ) => ({
    id: 1,
    externalId: '10',
    ownerId: '20',
    source: 'github.com',
    ...address,
  }),
  observeRepositoryIdentity: async () => ({ id: 1 }),
}))

it('only discovers unlinked collaborators by verified email on D1', async () => {
  const { Miniflare } = await import('miniflare')
  const { createD1Database } = await import('#/server/db/client')
  const worker = new Miniflare({
    modules: true,
    script: 'export default {fetch(){return new Response("ok")}}',
    compatibilityDate: '2026-07-30',
    d1Databases: { DATABASE: 'projects' },
  })
  try {
    const binding = await worker.getD1Database('DATABASE')
    await binding.batch([
      binding.prepare(
        'CREATE TABLE account (id text, user_id text, provider_id text, access_token text)',
      ),
      binding.prepare(
        'CREATE TABLE collaborator (owner text, repo text, repo_id integer, type text, installation_id integer, user_id text, email text, pending integer)',
      ),
      binding.prepare(
        "INSERT INTO collaborator VALUES ('Owner', 'site', 10, 'user', 30, NULL, 'USER@example.test', 0)",
      ),
      binding.prepare(
        "INSERT INTO collaborator VALUES ('Owner', 'pending', 11, 'user', 30, NULL, 'USER@example.test', 1)",
      ),
    ])
    const database = createD1Database(binding)
    const service = createRepositoryService(
      database,
      database,
      {} as RepositoryAccessService,
    )
    const user = {
      id: 'u',
      email: 'user@example.test',
      emailVerified: true,
      githubUsername: null,
    }
    expect((await service.getAccountAccess(user)).accounts).toMatchObject([
      { login: 'Owner', installationId: 30 },
    ])
    expect(
      (await service.getAccountAccess({ ...user, emailVerified: false }))
        .accounts,
    ).toEqual([])
    expect(
      await service.listRepositories(
        user,
        {
          login: 'owner',
          type: 'user',
          installationId: 30,
          repositorySelection: 'selected',
        },
        '',
      ),
    ).toMatchObject([{ id: 10, repo: 'site' }])
  } finally {
    await worker.dispose()
  }
})
