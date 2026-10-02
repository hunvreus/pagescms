import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import * as registry from '#/fields/registry'
import { selectOptions } from './select-options'
import { defaultDateValue } from './date-field'
import {
  initializeStructuredContent,
  validateStructuredContent,
} from './field-values'
import {
  mergeContent,
  projectContentFields,
  transformContentFields,
} from './content-field-values'
import { ConfigurationSchema } from './configuration-schema'

afterEach(() => vi.restoreAllMocks())

describe('field parity', () => {
  it('preserves deployment-provided component field values', () => {
    expect(
      validateStructuredContent([{ name: 'widget', component: 'widget' }], {
        widget: { value: 'custom' },
      }),
    ).toEqual([])
  })
  it('normalizes named, value, and primitive select options and rejects non-options', () => {
    const field = {
      name: 'status',
      type: 'select',
      options: {
        values: [
          { name: 'draft', label: 'Draft' },
          { value: 'live', label: 'Published' },
          1,
          false,
        ],
      },
    }
    expect(selectOptions(field)).toEqual([
      { value: 'draft', label: 'Draft' },
      { value: 'live', label: 'Published' },
      { value: '1', label: '1' },
      { value: 'false', label: 'false' },
    ])
    expect(validateStructuredContent([field], { status: 'draft' })).toEqual([])
    expect(validateStructuredContent([field], { status: 'wrong' })).toEqual([
      'status must use a configured option',
    ])
    expect(
      validateStructuredContent([{ ...field, options: { values: [] } }], {
        status: 'wrong',
      }),
    ).toHaveLength(1)
    const multiField = {
      ...field,
      options: { ...field.options, multiple: { min: 1, max: 2 } },
    }
    expect(
      validateStructuredContent([multiField], { status: ['draft', 'live'] }),
    ).toEqual([])
    expect(validateStructuredContent([multiField], { status: [] })).toEqual([
      'status requires at least 1 selections',
    ])
  })

  it('round-trips formatted dates through nested lists and selected blocks', () => {
    const date = {
      name: 'when',
      type: 'date',
      options: { format: 'dd/MM/yyyy' },
    }
    const fields = [
      {
        name: 'items',
        type: 'block',
        list: true,
        blockKey: 'kind',
        blocks: [{ name: 'event', fields: [date] }],
      },
    ]
    const stored = { items: [{ kind: 'event', when: '02/10/2026' }] }
    const editor = transformContentFields(fields, stored, 'read')
    expect(editor).toEqual({ items: [{ kind: 'event', when: '2026-10-02' }] })
    expect(validateStructuredContent(fields, editor as { items: [] })).toEqual(
      [],
    )
    expect(transformContentFields(fields, editor, 'write')).toEqual(stored)
    expect(() =>
      transformContentFields([date], { when: '31/02/2026' }, 'read'),
    ).toThrow(/invalid date/)
  })

  it('initializes local dates, times, and explicit formatted defaults', () => {
    expect(
      defaultDateValue(
        { options: { time: true } },
        new Date(2026, 9, 2, 14, 25),
      ),
    ).toBe('2026-10-02T14:25')
    expect(
      initializeStructuredContent([
        {
          name: 'when',
          type: 'date',
          default: '02/10/2026',
          options: { format: 'dd/MM/yyyy' },
        },
      ]),
    ).toEqual({ when: '2026-10-02' })
    expect(
      initializeStructuredContent([{ name: 'when', type: 'date' }]).when,
    ).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(
      transformContentFields(
        [
          {
            name: 'when',
            type: 'date',
            default: '02/10/2026',
            options: { format: 'dd/MM/yyyy' },
          },
        ],
        {},
        'read',
      ),
    ).toEqual({ when: '2026-10-02' })
  })

  it('retains custom regex error messages', () => {
    expect(
      validateStructuredContent(
        [
          {
            name: 'slug',
            type: 'string',
            pattern: { regex: '^abc$', message: 'Use abc' },
          },
        ],
        { slug: 'xyz' },
      ),
    ).toEqual(['slug: Use abc'])
  })

  it('projects configured fields recursively and merges objects while replacing arrays', () => {
    const fields = [
      {
        name: 'seo',
        type: 'object',
        fields: [{ name: 'title', type: 'string' }],
      },
      { name: 'tags', type: 'string', list: true },
    ]
    const submitted = projectContentFields(fields, {
      extra: true,
      seo: { title: 'New', extra: 1 },
      tags: ['new'],
    })
    expect(submitted).toEqual({ seo: { title: 'New' }, tags: ['new'] })
    expect(
      mergeContent(
        { extra: true, seo: { title: 'Old', extra: 1 }, tags: ['old'] },
        submitted as { seo: { title: string }; tags: string[] },
      ),
    ).toEqual({ extra: true, seo: { title: 'New', extra: 1 }, tags: ['new'] })
    expect(mergeContent({ tags: ['old'] }, { tags: [] })).toEqual({ tags: [] })
  })

  it('supports custom schemas, defaults, transforms, and configuration types', () => {
    vi.spyOn(registry, 'customFieldDefinition').mockImplementation((type) =>
      type === 'custom-test'
        ? {
            defaultValue: () => 'DEFAULT',
            schema: () =>
              z
                .string()
                .min(3, 'Three characters required')
                .transform((value) => value.toLowerCase()),
            read: (value) => String(value).toUpperCase(),
            write: (value) => `stored:${String(value)}`,
          }
        : undefined,
    )
    const field = { name: 'custom', type: 'custom-test' }
    expect(initializeStructuredContent([field])).toEqual({ custom: 'DEFAULT' })
    expect(validateStructuredContent([field], { custom: 'x' })).toEqual([
      'custom: Three characters required',
    ])
    expect(
      transformContentFields([field], { custom: 'saved' }, 'read'),
    ).toEqual({ custom: 'SAVED' })
    expect(
      transformContentFields([field], { custom: 'SAVED' }, 'write'),
    ).toEqual({ custom: 'stored:saved' })
    expect(
      ConfigurationSchema.safeParse({
        content: [
          { name: 'test', type: 'file', path: 'test.json', fields: [field] },
        ],
      }).success,
    ).toBe(true)
  })
})
