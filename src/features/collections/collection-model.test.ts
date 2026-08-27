import { describe, expect, it } from 'vitest'

import {
  collectionViewModel,
  collectionValue,
  rowSearchValue,
} from './collection-model'

describe('collectionViewModel', () => {
  it('uses configured fields in order and resolves nested field metadata', () => {
    const model = collectionViewModel({
      fields: [
        { name: 'title', label: 'Title', type: 'string' },
        {
          name: 'meta',
          type: 'object',
          fields: [{ name: 'description', label: 'Description', type: 'text' }],
        },
        { name: 'draft', label: 'Draft', type: 'boolean' },
      ],
      view: {
        fields: ['title', 'meta.description', 'draft'],
        primary: 'title',
      },
    })

    expect(model.columns.map(({ path }) => path)).toEqual([
      'title',
      'meta.description',
      'draft',
    ])
    expect(model.columns[1]).toMatchObject({
      label: 'Description',
      type: 'text',
    })
    expect(model.primary).toBe('title')
  })

  it('falls back to visible scalar fields and chooses title as primary', () => {
    const model = collectionViewModel({
      fields: [
        { name: 'internal', type: 'string', hidden: true },
        { name: 'settings', type: 'object', fields: [] },
        { name: 'title', type: 'string' },
        { name: 'published', type: 'boolean' },
      ],
      view: {},
    })

    expect(model.columns.map(({ path }) => path)).toEqual([
      'title',
      'published',
    ])
    expect(model.primary).toBe('title')
  })

  it('creates supported synthetic columns requested by the view', () => {
    const model = collectionViewModel({
      fields: [{ name: 'title', type: 'string' }],
      view: { fields: ['title', 'date'] },
    })

    expect(model.columns[1]).toMatchObject({
      path: 'date',
      label: 'Date',
      type: 'date',
    })
  })

  it('adds and defaults to descending date for dated filenames', () => {
    const model = collectionViewModel({
      fields: [{ name: 'title', type: 'string' }],
      filename: '{year}-{month}-{day}-{primary}.md',
      view: {},
    })

    expect(model.columns.map(({ path }) => path)).toEqual(['title', 'date'])
    expect(model.initial.sorting).toEqual([{ id: 'date', desc: true }])
  })

  it('normalizes the configured default search and sorting state', () => {
    const model = collectionViewModel({
      fields: [{ name: 'title', type: 'string' }],
      view: {
        default: { search: 'draft', sort: 'title', order: 'desc' },
        search: ['title'],
        sort: ['title'],
      },
    })

    expect(model.searchFields).toEqual(['title'])
    expect(model.sortFields).toEqual(['title'])
    expect(model.initial).toEqual({
      search: 'draft',
      sorting: [{ id: 'title', desc: true }],
    })
  })
})

describe('collection values', () => {
  const fields = {
    title: 'Hello',
    meta: { description: 'A useful article' },
    tags: ['cms', 'github'],
  }

  it('reads nested values safely', () => {
    expect(collectionValue(fields, 'meta.description')).toBe('A useful article')
    expect(collectionValue(fields, 'meta.missing')).toBeUndefined()
  })

  it('builds search text from configured fields only', () => {
    expect(rowSearchValue(fields, ['meta.description', 'tags'])).toBe(
      'A useful article cms github',
    )
  })
})
