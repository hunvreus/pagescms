import { describe, expect, it } from 'vitest'

import { addRecentProject, parseRecentProjects } from './recent-projects'

describe('recent projects', () => {
  it('keeps the most recent branch for a repository without duplicates', () => {
    const visits = addRecentProject(
      [
        {
          owner: 'PagesCMS',
          repo: 'website',
          branch: 'main',
          timestamp: 100,
        },
        {
          owner: 'PagesCMS',
          repo: 'docs',
          branch: 'main',
          timestamp: 200,
        },
      ],
      {
        owner: 'pagescms',
        repo: 'WEBSITE',
        branch: 'redesign',
        timestamp: 300,
      },
    )

    expect(visits).toEqual([
      {
        owner: 'pagescms',
        repo: 'WEBSITE',
        branch: 'redesign',
        timestamp: 300,
      },
      {
        owner: 'PagesCMS',
        repo: 'docs',
        branch: 'main',
        timestamp: 200,
      },
    ])
  })

  it('keeps at most five visits ordered by recency', () => {
    const visits = Array.from({ length: 6 }, (_, index) => ({
      owner: 'pagescms',
      repo: `repo-${index}`,
      branch: 'main',
      timestamp: index,
    }))

    expect(
      addRecentProject(visits.slice(0, 5), visits[5]).map(
        (visit) => visit.repo,
      ),
    ).toEqual(['repo-5', 'repo-4', 'repo-3', 'repo-2', 'repo-1'])
  })

  it('accepts the legacy latestVisits payload and drops invalid entries', () => {
    expect(
      parseRecentProjects(
        JSON.stringify([
          {
            owner: 'pagescms',
            repo: 'website',
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
        branch: 'main',
        timestamp: 42,
      },
    ])
  })
})
