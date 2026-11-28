import {
  validateStructuredContent,
  validateStructuredList,
} from '../../tests/field-validation'
import { describe, expect, it } from 'vitest'

import { initializeStructuredContent } from './field-values'
import { transformContentFields } from './content-field-values'
import {
  richTextValueForEditor,
  richTextValueForStorage,
} from '#/features/editor/rich-text-media'

describe('field parity regressions', () => {
  it.each(['select', 'reference', 'image', 'file'])(
    'validates multiple %s selections inside a field list',
    (type) => {
      const field = {
        name: 'items',
        type,
        list: true,
        options: { multiple: true, values: ['a', 'b'], min: 1, max: 2 },
      }
      expect(
        validateStructuredContent([field], { items: [['a', 'b']] }),
      ).toEqual([])
      expect(validateStructuredContent([field], { items: [[]] })).not.toEqual(
        [],
      )
      expect(
        validateStructuredContent([field], { items: [['a', 'b', 'a']] }),
      ).not.toEqual([])
    },
  )

  it('normalizes saved reference objects without re-enabling object writes', () => {
    const fields = [
      { name: 'author', type: 'reference' },
      { name: 'authors', type: 'reference', options: { multiple: true } },
    ]
    const stored = {
      author: { value: 'ada.json', label: 'Ada' },
      authors: { value: 'grace.json', label: 'Grace' },
    }
    expect(transformContentFields(fields, stored, 'write')).toEqual({
      author: 'ada.json',
      authors: ['grace.json'],
    })
    expect(validateStructuredContent(fields, stored)).toEqual([])
  })

  it.each([
    '00000000-0000-0000-0000-000000000000',
    'ffffffff-ffff-ffff-ffff-ffffffffffff',
  ])('retains the previously accepted special UUID %s', (value) =>
    expect(
      validateStructuredContent([{ name: 'id', type: 'uuid' }], { id: value }),
    ).toEqual([]),
  )

  it('rewrites complete balanced image destinations and preserves nested alt text', () => {
    const media = {
      name: 'images',
      input: 'public/images',
      output: '/images',
      extensions: ['png'],
    }
    const context = { owner: 'o', repo: 'r', branch: 'main', name: 'images' }
    for (const source of [
      '![Photo](/images/photo(1).png)',
      '![A [nested] alt](/images/photo.png)',
    ]) {
      const preview = richTextValueForEditor(source, media, context)
      expect(preview).toContain('/api/media-preview/')
      if (source.includes('(1)')) expect(preview).toContain('photo%281%29.png')
      expect(richTextValueForStorage(preview, media, context)).toBe(
        source.replace('photo(1)', 'photo%281%29'),
      )
    }
  })
})

it('honors list defaults before scalar defaults and rejects empty retained rows', () => {
  const field = {
    name: 'values',
    type: 'string',
    default: 'scalar',
    list: { default: ['list'], min: 1 },
  }
  expect(initializeStructuredContent([field])).toEqual({ values: ['list'] })
  expect(validateStructuredContent([field], { values: [null] })).not.toEqual([])
})
it('ignores empty optional objects but validates present required nested fields', () => {
  const field = {
    name: 'seo',
    type: 'object',
    fields: [
      { name: 'title', type: 'string', required: true },
      { name: 'description', type: 'text' },
    ],
  }
  expect(validateStructuredContent([field], { seo: {} })).toEqual([])
  expect(
    validateStructuredContent([field], { seo: { description: 'Present' } }),
  ).toEqual(['seo.title is required'])
})
it('normalizes numeric and boolean strings without treating false as true', () => {
  const fields = [
    { name: 'count', type: 'number' },
    { name: 'published', type: 'boolean' },
  ]
  expect(
    transformContentFields(fields, { count: '0', published: 'false' }, 'write'),
  ).toEqual({ count: 0, published: false })
  expect(
    validateStructuredContent(fields, {
      count: 'not numeric',
      published: 'no',
    }),
  ).toHaveLength(2)
})
it('leaves image examples in inline and fenced code untouched', () => {
  const media = {
    name: 'images',
    input: 'public/images',
    output: '/images',
    extensions: ['png'],
  }
  const context = { owner: 'o', repo: 'r', branch: 'main', name: 'images' }
  for (const source of [
    '`![image](/images/a.png)`',
    '```md\n![image](/images/a.png)\n```',
    '~~~md\n![image](/images/a.png)\n~~~',
    '```md\n![image](/images/a.png)',
    '  ~~~~md\n![image](/images/a.png)\n  ~~~~',
  ])
    expect(richTextValueForEditor(source, media, context)).toBe(source)
})

it('rejects empty root rows before cleanup can bypass root list limits', () => {
  expect(
    validateStructuredList([{ name: 'title', type: 'string' }], [{}], {
      min: 1,
    }),
  ).toEqual(['Item 1 is empty; enter a value or remove this item'])
})

it.each(['select', 'reference', 'image', 'file'])(
  'distinguishes missing optional %s values from explicitly cleared minimum selections',
  (type) => {
    const field = {
      name: 'value',
      type,
      options: { multiple: true, min: 1, values: ['a'] },
    }
    expect(validateStructuredContent([field], {})).toEqual([])
    expect(validateStructuredContent([field], { value: [] })).not.toEqual([])
  },
)

it('rewrites a wrapped image URL without changing its title or nested alt text', () => {
  const media = {
    name: 'images',
    input: 'public/images',
    output: '/images',
    extensions: ['png'],
  }
  const context = { owner: 'o', repo: 'r', branch: 'main', name: 'images' }
  const source = '![A [nested] alt](</images/photo (1).png> "A (titled) image")'
  const preview = richTextValueForEditor(source, media, context)
  expect(preview).toContain('/api/media-preview/')
  expect(preview).toContain('![A [nested] alt](')
  expect(preview).toContain('"A (titled) image")')
  expect(richTextValueForStorage(preview, media, context)).toBe(source)
})
