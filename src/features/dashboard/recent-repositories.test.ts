import { afterEach, describe, expect, it, vi } from 'vitest'
import { rememberRepositoryIdentity } from '#/lib/repository-identity'

import {
  addRecentRepository,
  parseRecentRepositories,
} from './recent-repositories'

describe('recent projects', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('keeps one repository across renames and transfers using its latest address', () => {
    const current = {
      owner: 'new-owner',
      repo: 'renamed',
      repoId: '52',
      source: 'github.com',
      branch: 'main',
      timestamp: 20,
    }
    expect(
      addRecentRepository(
        [{ ...current, owner: 'old-owner', repo: 'old-name', timestamp: 10 }],
        current,
      ),
    ).toEqual([current])
  })

  it('preserves distinct IDs, owners and providers even when names are identical', () => {
    const base = {
      owner: 'org',
      repo: 'same-name',
      source: 'github.com',
      branch: 'main',
      timestamp: 20,
    }
    const visits = [
      { ...base, repoId: '1' },
      { ...base, repoId: '2' },
      { ...base, repoId: '3', owner: 'other-org' },
      { ...base, source: 'git.example.com', repoId: '1' },
    ]
    expect(parseRecentRepositories(JSON.stringify(visits))).toEqual(visits)
  })

  it('does not reassign an explicit old ID when its address has been reused', () => {
    vi.stubGlobal('window', {})
    const old = {
      owner: 'reused-owner',
      repo: 'reused-name',
      repoId: '71',
      source: 'github.com',
      branch: 'main',
      timestamp: 20,
    }
    rememberRepositoryIdentity({ ...old, id: 72 })
    expect(parseRecentRepositories(JSON.stringify([old]))).toEqual([old])
  })

  it('drops missing or malformed identities', () => {
    const base = { owner: 'org', repo: 'repo', branch: 'main', timestamp: 20 }
    expect(
      parseRecentRepositories(
        JSON.stringify([
          { ...base, source: 'github.com' },
          { ...base, source: 'github.com', repoId: {} },
          { ...base, repoId: '1', source: 1 },
        ]),
      ),
    ).toEqual([])
  })

  it('keeps the most recent branch for a repository without duplicates', () => {
    const visits = addRecentRepository(
      [
        {
          owner: 'PagesCMS',
          repo: 'website',
          repoId: '1',
          source: 'github.com',
          branch: 'main',
          timestamp: 100,
        },
        {
          owner: 'PagesCMS',
          repo: 'docs',
          repoId: '2',
          source: 'github.com',
          branch: 'main',
          timestamp: 200,
        },
      ],
      {
        owner: 'pagescms',
        repo: 'WEBSITE',
        repoId: '1',
        source: 'github.com',
        branch: 'redesign',
        timestamp: 300,
      },
    )

    expect(visits).toEqual([
      {
        owner: 'pagescms',
        repo: 'WEBSITE',
        repoId: '1',
        source: 'github.com',
        branch: 'redesign',
        timestamp: 300,
      },
      {
        owner: 'PagesCMS',
        repo: 'docs',
        repoId: '2',
        source: 'github.com',
        branch: 'main',
        timestamp: 200,
      },
    ])
  })

  it('keeps at most five visits ordered by recency', () => {
    const visits = Array.from({ length: 6 }, (_, index) => ({
      owner: 'pagescms',
      repo: `repo-${index}`,
      repoId: String(index),
      source: 'github.com',
      branch: 'main',
      timestamp: index,
    }))

    expect(
      addRecentRepository(visits.slice(0, 5), visits[5]).map(
        (visit) => visit.repo,
      ),
    ).toEqual(['repo-5', 'repo-4', 'repo-3', 'repo-2', 'repo-1'])
  })

  it('accepts stored visits and drops invalid entries', () => {
    expect(
      parseRecentRepositories(
        JSON.stringify([
          {
            owner: 'pagescms',
            repo: 'website',
            repoId: '1',
            source: 'github.com',
            branch: 'main',
            timestamp: 42,
          },
          { owner: 'pagescms', repo: '', branch: 'main', timestamp: 41 },
        ]),
      ),
    ).toEqual([
      {
        owner: 'pagescms',
        repo: 'website',
        repoId: '1',
        source: 'github.com',
        branch: 'main',
        timestamp: 42,
      },
    ])
  })
})
