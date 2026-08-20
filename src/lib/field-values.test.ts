import { describe, expect, it } from 'vitest'

import {
  initializeStructuredContent,
  validateStructuredContent,
} from './field-values'

describe('structured field values', () => {
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
    ])
    expect(content).toMatchObject({
      title: 'Untitled',
      published: false,
      tags: [],
      seo: { description: 'Summary' },
    })
    expect(content.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
  })
})
