import { describe, expect, it } from 'vitest'

import { parseRepositorySearch } from './projects'

describe('parseRepositorySearch', () => {
  it('normalizes a bounded repository search', () => {
    expect(
      parseRepositorySearch({
        account: {
          login: 'PagesCMS',
          type: 'org',
          repositorySelection: 'all',
          installationId: 42,
        },
        keyword: '  documentation  ',
      }),
    ).toEqual({
      account: {
        login: 'PagesCMS',
        type: 'org',
        repositorySelection: 'all',
        installationId: 42,
      },
      keyword: 'documentation',
    })
  })

  it.each([
    { account: null },
    {
      account: {
        login: '../owner',
        type: 'org',
        repositorySelection: 'all',
        installationId: 42,
      },
    },
    {
      account: {
        login: 'owner',
        type: 'org',
        repositorySelection: 'all',
        installationId: -1,
      },
    },
  ])('rejects invalid account input', (input) => {
    expect(() => parseRepositorySearch(input)).toThrow()
  })
})
