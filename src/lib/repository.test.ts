import { describe, expect, it } from 'vitest'

import { repositoryRef } from './repository'

describe('repository identity', () => {
  it('preserves repository display casing', () => {
    expect(repositoryRef({ owner: 'Hunvreus', repo: 'PagesCMS' })).toEqual({
      owner: 'Hunvreus',
      repo: 'PagesCMS',
    })
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
