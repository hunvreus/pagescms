import { describe, expect, it } from 'vitest'

import { queryKeys } from './keys'

describe('query keys', () => {
  it('normalizes repository identity while preserving the branch', () => {
    expect(
      queryKeys.branch({ owner: 'PagesCMS', repo: 'Demo', branch: 'Preview' }),
    ).toEqual(['pagescms', 'repositories', 'pagescms', 'demo', 'Preview'])
  })

  it('groups branch resources below the branch key', () => {
    const branch = { owner: 'PagesCMS', repo: 'Demo', branch: 'main' }
    expect([...queryKeys.branch(branch), 'collections', 'posts', '']).toEqual([
      'pagescms',
      'repositories',
      'pagescms',
      'demo',
      'main',
      'collections',
      'posts',
      '',
    ])
  })
})
