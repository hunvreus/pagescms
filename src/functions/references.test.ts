import { describe, expect, it } from 'vitest'

import { parseReferenceRequest } from './references'

describe('reference requests', () => {
  it('normalizes repository coordinates and bounds searches', () => {
    expect(
      parseReferenceRequest({
        owner: ' PagesCMS ',
        repo: 'pages-cms',
        branch: 'main',
        collection: 'authors',
        query: 'ada',
        valueTemplate: '{path}',
        labelTemplate: '{title}',
        searchFields: ['title'],
        selectedValues: [],
      }),
    ).toMatchObject({ owner: 'PagesCMS', collection: 'authors', query: 'ada' })
    expect(() =>
      parseReferenceRequest({
        owner: 'PagesCMS',
        repo: 'pages-cms',
        branch: 'main',
        collection: 'authors',
        query: 'x'.repeat(101),
        valueTemplate: '{path}',
        labelTemplate: '{name}',
        searchFields: ['name'],
        selectedValues: [],
      }),
    ).toThrow('too large')
  })
})
