import { validateStructuredContent } from '../../tests/field-validation'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import * as registry from '#/fields/registry'
import { initializeStructuredContent } from './field-values'
import { transformContentFields } from './content-field-values'
import { contentValidationIssues } from './content-validation'
import { transformMediaFieldValues } from './media-field-values'

afterEach(() => vi.restoreAllMocks())

describe('ported custom-field contracts', () => {
  it('lets custom media and structural overrides own their saved representation', () => {
    vi.spyOn(registry, 'customFieldDefinition').mockImplementation((type) =>
      ['image', 'object'].includes(type)
        ? { schema: () => z.string() }
        : undefined,
    )
    const fields = [
      { name: 'asset', type: 'image' },
      {
        name: 'details',
        type: 'object',
        fields: [{ name: 'picture', type: 'image' }],
      },
    ]
    const value = { asset: '/uploads/asset.custom', details: 'custom object' }
    const media = [
      {
        name: 'default',
        input: 'public/uploads',
        output: '/uploads',
        extensions: ['png'],
      },
    ]
    expect(contentValidationIssues(fields, value, media)).toEqual([])
    expect(transformMediaFieldValues(fields, value, media, 'read')).toEqual(
      value,
    )
    expect(transformMediaFieldValues(fields, value, media, 'write')).toEqual(
      value,
    )
  })
  it('supports literal and callable defaults, including built-in overrides, without sharing mutable defaults', () => {
    const defaultValue = vi.fn((field) => ({ label: field.label }))
    vi.spyOn(registry, 'customFieldDefinition').mockImplementation((type) =>
      type === 'literal'
        ? { defaultValue: { entries: ['first'] } }
        : type === 'date'
          ? { defaultValue }
          : type === 'boolean'
            ? { label: 'Custom boolean with no default' }
            : undefined,
    )
    const fields = [
      { name: 'literal', type: 'literal' },
      { name: 'date', type: 'date', label: 'Custom date' },
      { name: 'flag', type: 'boolean' },
    ]
    const first = initializeStructuredContent(fields)
    expect(first).toEqual({
      literal: { entries: ['first'] },
      date: { label: 'Custom date' },
    })
    ;(first.literal as { entries: string[] }).entries.push('changed')
    expect(initializeStructuredContent(fields).literal).toEqual({
      entries: ['first'],
    })
    expect(defaultValue).toHaveBeenCalledWith(fields[1])
  })

  it('passes the field and configuration through recursive read/write hooks and applies schema coercion before writing', () => {
    const read = vi.fn(
      (value, field, configuration) =>
        `${configuration.prefix}:${field.name}:${value}`,
    )
    const write = vi.fn(
      (value, field, configuration) =>
        `${configuration.prefix}:${field.name}:${value}`,
    )
    vi.spyOn(registry, 'customFieldDefinition').mockImplementation((type) =>
      type === 'number'
        ? {
            schema: () => z.string().transform((value) => value.toLowerCase()),
            read,
            write,
          }
        : undefined,
    )
    const field = { name: 'value', type: 'number', list: true }
    const fields = [
      { name: 'items', type: 'object', list: true, fields: [field] },
    ]
    const configuration = { prefix: 'context' }
    expect(
      transformContentFields(
        fields,
        { items: [{ value: ['SAVED'] }] },
        'read',
        { configuration },
      ),
    ).toEqual({ items: [{ value: ['context:value:SAVED'] }] })
    expect(
      transformContentFields(
        fields,
        { items: [{ value: ['EDITED'] }] },
        'write',
        { configuration },
      ),
    ).toEqual({ items: [{ value: ['context:value:edited'] }] })
    expect(read).toHaveBeenCalledWith('SAVED', field, configuration)
    expect(write).toHaveBeenCalledWith('edited', field, configuration)
    expect(
      validateStructuredContent(fields, { items: [{ value: ['CUSTOM'] }] }),
    ).toEqual([])
  })

  it('normalizes formatted date defaults at every nested list/object/block boundary', () => {
    const date = {
      name: 'when',
      type: 'date',
      options: { format: 'dd/MM/yyyy' },
    }
    const fields = [
      { ...date, list: { default: ['21/10/2026', '22/10/2026'] } },
      {
        name: 'events',
        type: 'object',
        list: { default: [{ when: '21/10/2026' }] },
        fields: [date],
      },
      {
        name: 'blocks',
        type: 'block',
        blockKey: 'kind',
        list: { default: [{ kind: 'event', when: '21/10/2026' }] },
        blocks: [{ name: 'event', fields: [date] }],
      },
    ]
    const original = structuredClone(fields)
    expect(initializeStructuredContent(fields)).toEqual({
      when: ['2026-10-21', '2026-10-22'],
      events: [{ when: '2026-10-21' }],
      blocks: [{ kind: 'event', when: '2026-10-21' }],
    })
    expect(fields).toEqual(original)
  })
})
