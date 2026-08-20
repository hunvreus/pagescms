import { describe, expect, it } from 'vitest'

import {
  initializeStructuredContent,
  validateStructuredContent,
  validateStructuredList,
} from './field-values'

describe('structured field values', () => {
  it('validates root list items and limits', () => {
    expect(
      validateStructuredList(
        [{ name: 'title', type: 'string', required: true }],
        [{ title: 'First' }, {}],
        { min: 3 },
      ),
    ).toEqual(['Content requires at least 3 items', 'Item 2.title is required'])
  })

  it('validates required, typed, patterned, nested, and list fields', () => {
    const fields = [
      { name: 'title', type: 'string', required: true, pattern: '^Page' },
      { name: 'weight', type: 'number' },
      { name: 'published', type: 'boolean' },
      { name: 'tags', type: 'string', list: { min: 2, max: 3 } },
      {
        name: 'seo',
        type: 'object',
        fields: [{ name: 'description', type: 'text', required: true }],
      },
    ]
    expect(
      validateStructuredContent(fields, {
        title: 'Wrong',
        weight: 'heavy',
        published: 'yes',
        tags: ['one'],
        seo: {},
      }),
    ).toEqual([
      'title has an invalid format',
      'weight must be a number',
      'published must be true or false',
      'tags requires at least 2 items',
      'seo.description is required',
    ])
  })

  it('accepts valid configured select values', () => {
    expect(
      validateStructuredContent(
        [
          {
            name: 'status',
            type: 'select',
            options: { values: ['draft', { value: 'published' }] },
          },
        ],
        { status: 'published' },
      ),
    ).toEqual([])
  })

  it('initializes defaults, booleans, UUIDs, objects, and lists', () => {
    const content = initializeStructuredContent([
      { name: 'title', type: 'string', default: 'Untitled' },
      { name: 'published', type: 'boolean' },
      { name: 'id', type: 'uuid' },
      { name: 'tags', type: 'string', list: true },
      {
        name: 'seo',
        type: 'object',
        fields: [{ name: 'description', type: 'text', default: 'Summary' }],
      },
      {
        name: 'hero',
        type: 'block',
        blocks: [
          {
            name: 'image',
            fields: [{ name: 'alt', type: 'string', default: 'Hero' }],
          },
        ],
      },
    ])
    expect(content).toMatchObject({
      title: 'Untitled',
      published: false,
      tags: [],
      seo: { description: 'Summary' },
      hero: { _block: 'image', alt: 'Hero' },
    })
    expect(content.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
  })

  it('validates block discriminators and nested fields', () => {
    const fields = [
      {
        name: 'hero',
        type: 'block',
        blocks: [
          {
            name: 'image',
            fields: [{ name: 'src', type: 'image', required: true }],
          },
        ],
      },
    ]
    expect(
      validateStructuredContent(fields, { hero: { _block: 'video' } }),
    ).toEqual(['hero uses an unknown block type'])
    expect(
      validateStructuredContent(fields, { hero: { _block: 'image' } }),
    ).toEqual(['hero.src is required'])
  })

  it('supports media fields configured for multiple paths', () => {
    const fields = [
      { name: 'gallery', type: 'image', options: { multiple: true } },
    ]
    expect(initializeStructuredContent(fields)).toEqual({ gallery: [] })
    expect(
      validateStructuredContent(fields, { gallery: ['one.jpg', 'two.jpg'] }),
    ).toEqual([])
    expect(validateStructuredContent(fields, { gallery: 'one.jpg' })).toEqual([
      'gallery must be a list of file paths',
    ])
  })
})
