import { describe, expect, it } from 'vitest'

import { validateStructuredContent } from './field-values'

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
})
