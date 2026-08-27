import { describe, expect, it } from 'vitest'

import {
  initializeStructuredContent,
  sanitizeStructuredContent,
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

  it('validates numeric, date, and UUID field constraints', () => {
    const fields = [
      { name: 'weight', type: 'number', options: { min: 1, max: 5 } },
      {
        name: 'launch',
        type: 'date',
        options: { min: '2026-01-01', max: '2026-12-31' },
      },
      { name: 'id', type: 'uuid' },
    ]
    expect(
      validateStructuredContent(fields, {
        weight: 10,
        launch: '2027-01-01',
        id: 'not-a-uuid',
      }),
    ).toEqual([
      'weight must be at most 5',
      'launch must be on or before 2026-12-31',
      'id must be a valid UUID',
    ])
  })

  it('validates configured multiple selections', () => {
    const fields = [
      {
        name: 'topics',
        type: 'select',
        options: {
          multiple: true,
          min: 2,
          max: 3,
          values: ['news', 'events'],
        },
      },
      {
        name: 'related',
        type: 'reference',
        options: { multiple: true, max: 1 },
      },
      {
        name: 'gallery',
        type: 'image',
        options: { multiple: { max: 1 } },
      },
    ]
    expect(
      validateStructuredContent(fields, {
        topics: ['news'],
        related: ['one', 'two'],
        gallery: ['one.jpg', 'two.jpg'],
      }),
    ).toEqual([
      'topics requires at least 2 selections',
      'related allows at most 1 selections',
      'gallery allows at most 1 selections',
    ])
    expect(
      validateStructuredContent(fields, {
        topics: [],
        related: [],
        gallery: [],
      }),
    ).toEqual(['topics requires at least 2 selections'])
    expect(
      validateStructuredContent(fields, {
        topics: ['unknown', 'events'],
        related: [],
        gallery: [],
      }),
    ).toEqual(['topics must be a list of valid values'])
  })

  it('initializes defaults, booleans, UUIDs, objects, and lists', () => {
    const content = initializeStructuredContent([
      { name: 'title', type: 'string', default: 'Untitled' },
      { name: 'published', type: 'boolean' },
      { name: 'id', type: 'uuid' },
      { name: 'tags', type: 'string', list: true },
      {
        name: 'categories',
        type: 'string',
        list: { default: ['general'] },
      },
      { name: 'topics', type: 'select', options: { multiple: true } },
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
      categories: ['general'],
      topics: [],
      seo: { description: 'Summary' },
      hero: null,
    })
    expect(content.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
  })

  it('respects an explicit block default without selecting one implicitly', () => {
    const fields = [
      {
        name: 'hero',
        type: 'block',
        default: { _block: 'image', alt: 'Configured' },
        blocks: [{ name: 'image', fields: [{ name: 'alt', type: 'string' }] }],
      },
    ]

    expect(initializeStructuredContent(fields)).toEqual({
      hero: { _block: 'image', alt: 'Configured' },
    })
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

  it('initializes deeply nested object, list, and block defaults', () => {
    expect(
      initializeStructuredContent([
        {
          name: 'sections',
          type: 'object',
          list: {
            default: [
              {
                title: 'Introduction',
                content: { kind: 'copy', body: 'Hello' },
              },
            ],
          },
          fields: [
            { name: 'title', type: 'string' },
            {
              name: 'content',
              type: 'block',
              blockKey: 'kind',
              blocks: [
                {
                  name: 'copy',
                  fields: [{ name: 'body', type: 'text' }],
                },
              ],
            },
          ],
        },
      ]),
    ).toEqual({
      sections: [
        {
          title: 'Introduction',
          content: { kind: 'copy', body: 'Hello' },
        },
      ],
    })
  })

  it('removes empty nested values without removing false, zero, or block keys', () => {
    expect(
      sanitizeStructuredContent({
        title: '',
        enabled: false,
        weight: 0,
        emptyObject: { label: '', nested: { value: null } },
        sections: [
          null,
          '',
          { _block: 'copy', body: '', enabled: false },
          { title: 'Kept' },
        ],
      }),
    ).toEqual({
      enabled: false,
      weight: 0,
      sections: [{ _block: 'copy', enabled: false }, { title: 'Kept' }],
    })
  })
})
