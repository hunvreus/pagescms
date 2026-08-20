import { describe, expect, it } from 'vitest'

import { parseBranchCreate } from './repository'

describe('branch creation requests', () => {
  it('accepts nested branch names', () => {
    expect(
      parseBranchCreate({
        owner: ' PagesCMS ',
        repo: 'pages-cms',
        branch: ' feature/editor ',
        source: 'main',
      }),
    ).toEqual({
      owner: 'PagesCMS',
      repo: 'pages-cms',
      branch: 'feature/editor',
      source: 'main',
    })
  })

  it.each(['bad..name', 'bad name', '/bad', 'bad/', 'bad.lock', 'bad@{x'])(
    'rejects invalid branch %s',
    (branch) => {
      expect(() =>
        parseBranchCreate({
          owner: 'PagesCMS',
          repo: 'pages-cms',
          branch,
          source: 'main',
        }),
      ).toThrow('Invalid branch name')
    },
  )
})
