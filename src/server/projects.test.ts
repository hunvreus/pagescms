import { describe, expect, it } from 'vitest'

import {
  mergeProjectAccounts,
  mergeProjectRepositories,
} from './projects.server'

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

describe('mergeProjectRepositories', () => {
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
