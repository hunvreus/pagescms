import { describe, expect, it } from 'vitest'

import {
  branchCacheKey,
  decodeRouteSegment,
  encodeRouteSegment,
  fileCacheKey,
  repositoryCacheKey,
  repositoryRef,
} from './repository'

describe('repository identity', () => {
  it('preserves display casing while producing a case-insensitive repository key', () => {
    const repository = repositoryRef({
      owner: 'Hunvreus',
      repo: 'PagesCMS',
    })

    expect(repository).toEqual({ owner: 'Hunvreus', repo: 'PagesCMS' })
    expect(repositoryCacheKey(repository)).toEqual([
      'repository',
      'hunvreus',
      'pagescms',
    ])
  })

  it('trims user-provided repository identifiers', () => {
    expect(repositoryRef({ owner: ' hunvreus ', repo: ' pagescms ' })).toEqual({
      owner: 'hunvreus',
      repo: 'pagescms',
    })
  })

  it.each([
    { owner: '', repo: 'pagescms' },
    { owner: 'hunvreus', repo: '' },
    { owner: 'hunvreus/example', repo: 'pagescms' },
    { owner: 'hunvreus', repo: 'pages/cms' },
  ])('rejects invalid repository coordinates: %o', (input) => {
    expect(() => repositoryRef(input)).toThrow('repository')
  })
})

describe('branch route segments', () => {
  it.each([
    'main',
    'feature/editor',
    'release candidate',
    'fix#123',
    'percent%branch',
    'international/été',
  ])('round-trips %s as exactly one route segment', (branch) => {
    expect(decodeRouteSegment(encodeRouteSegment(branch))).toBe(branch)
  })

  it('decodes exactly once', () => {
    expect(decodeRouteSegment('feature%252Feditor')).toBe('feature%2Feditor')
  })

  it('rejects malformed encoded segments', () => {
    expect(() => decodeRouteSegment('%E0%A4%A')).toThrow('route segment')
  })
})

describe('cache identity', () => {
  const repository = repositoryRef({ owner: 'Hunvreus', repo: 'PagesCMS' })

  it('treats repository casing as equivalent and branch casing as distinct', () => {
    const differentlyCased = repositoryRef({
      owner: 'hunvreus',
      repo: 'pagescms',
    })

    expect(branchCacheKey(repository, 'Main')).toEqual([
      'branch',
      'hunvreus',
      'pagescms',
      'Main',
    ])
    expect(branchCacheKey(differentlyCased, 'Main')).toEqual(
      branchCacheKey(repository, 'Main'),
    )
    expect(branchCacheKey(repository, 'main')).not.toEqual(
      branchCacheKey(repository, 'Main'),
    )
  })

  it('uses the canonical Git path in file cache keys', () => {
    expect(
      fileCacheKey(repository, 'feature/editor', 'content//posts/./hello.md'),
    ).toEqual([
      'file',
      'hunvreus',
      'pagescms',
      'feature/editor',
      'content/posts/hello.md',
    ])
  })
})
