import { describe, expect, it } from 'vitest'

import {
  getListFieldOptions,
  getListItemSummary,
} from './structured-field-options'

describe('structured field options', () => {
  it('enables collapsing by default only for object and block lists', () => {
    expect(getListFieldOptions({ type: 'object', list: true })).toMatchObject({
      collapsible: true,
      initiallyCollapsed: false,
    })
    expect(
      getListFieldOptions({
        type: 'block',
        list: { collapsible: { collapsed: true } },
      }),
    ).toMatchObject({ collapsible: true, initiallyCollapsed: true })
    expect(
      getListFieldOptions({
        type: 'object',
        list: { collapsible: false },
      }),
    ).toMatchObject({ collapsible: false })
    expect(getListFieldOptions({ type: 'string', list: true })).toMatchObject({
      collapsible: false,
    })
  })

  it('interpolates configured summaries with nested fields and indexes', () => {
    const field = {
      type: 'object',
      list: {
        collapsible: {
          summary: '{index}. {title} — {author.name} — {missing}',
        },
      },
    }

    expect(
      getListItemSummary(
        field,
        { title: 'Hello', author: { name: 'Ronan' } },
        1,
      ),
    ).toBe('2. Hello — Ronan — ')
  })

  it('uses a stable item label without a configured summary', () => {
    expect(getListItemSummary({ type: 'object', list: true }, {}, 0)).toBe(
      'Item #1',
    )
  })
})
