import { describe, expect, it } from 'vitest'

import { parseRepositorySearch, parseTemplateCopy } from './projects'

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

describe('parseTemplateCopy', () => {
  const account = {
    login: 'PagesCMS',
    type: 'org' as const,
    repositorySelection: 'all' as const,
    installationId: 42,
  }

  it('accepts a known template and repository name', () => {
    expect(
      parseTemplateCopy({
        account,
        name: 'my-blog',
        template: 'pagescms/astro-blog-template',
      }),
    ).toEqual({
      account,
      name: 'my-blog',
      templateOwner: 'pagescms',
      templateRepo: 'astro-blog-template',
    })
  })

  it.each([
    { name: '.hidden', template: 'pagescms/astro-blog-template' },
    { name: 'bad/name', template: 'pagescms/astro-blog-template' },
    { name: 'blog', template: 'unknown/template' },
  ])('rejects invalid template requests', (input) => {
    expect(() => parseTemplateCopy({ account, ...input })).toThrow()
  })
})
