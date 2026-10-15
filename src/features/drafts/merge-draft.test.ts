import { describe, expect, it } from 'vitest'
import { equalMergeValue, mergeDraft } from './merge-draft'
import { conflictLabel, mergeField } from './draft-merge-fields'

describe('three-way draft merging', () => {
  it('combines changes to different nested fields', () => {
    const original = { title: 'Original', author: { name: 'A', email: 'old' } }
    const mine = { ...original, author: { ...original.author, name: 'Local' } }
    const remote = {
      ...original,
      title: 'New title',
      author: { ...original.author, email: 'new' },
    }
    const plan = mergeDraft({ value: original }, mine, remote)
    expect(plan.conflicts).toEqual([])
    expect(plan.resolve({})).toEqual({
      title: 'New title',
      author: { name: 'Local', email: 'new' },
    })
  })
  it('requires a choice only when the same leaf changed differently', () => {
    const plan = mergeDraft(
      { value: { title: 'Old', published: false } },
      { title: 'Mine', published: false },
      { title: 'Theirs', published: true },
    )
    expect(plan.conflicts.map((item) => item.path)).toEqual([['title']])
    expect(() => plan.resolve({})).toThrow('Choose a version')
    expect(plan.resolve({ 0: 'mine' })).toEqual({
      title: 'Mine',
      published: true,
    })
    expect(plan.resolve({ 0: 'remote' })).toEqual({
      title: 'Theirs',
      published: true,
    })
  })
  it('does not treat identical changes or object key order as conflicts', () => {
    const plan = mergeDraft(
      { value: { a: 1, b: 2 } },
      { b: 3, a: 1 },
      { a: 1, b: 3 },
    )
    expect(plan.conflicts).toEqual([])
    expect(equalMergeValue({ a: 1, b: 3 }, { b: 3, a: 1 })).toBe(true)
  })
  it('treats reordered, duplicated and independently edited list items as one value', () => {
    const original = {
      items: [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
      ],
    }
    const mine = {
      items: [original.items[1], original.items[0], original.items[0]],
    }
    const remote = { items: [{ id: 'a', name: 'Changed' }, original.items[1]] }
    const plan = mergeDraft({ value: original }, mine, remote)
    expect(plan.conflicts.map((item) => item.path)).toEqual([['items']])
    expect(plan.resolve({ 0: 'mine' })).toEqual(mine)
    expect(plan.resolve({ 0: 'remote' })).toEqual(remote)
  })
  it('accepts a list changed on only one side', () => {
    const original = { items: ['A'], title: 'Old' }
    const plan = mergeDraft(
      { value: original },
      { ...original, items: ['B', 'A'] },
      { ...original, title: 'New' },
    )
    expect(plan.resolve({})).toEqual({ items: ['B', 'A'], title: 'New' })
  })
  it('keeps a polymorphic block whole, including custom block discriminator keys', () => {
    const fields = [{ name: 'hero', type: 'block', blockKey: 'kind' }]
    const original = { hero: { kind: 'text', title: 'Original' } }
    const mine = { hero: { kind: 'image', title: 'Original' } }
    const remote = { hero: { kind: 'text', title: 'Remote' } }
    const plan = mergeDraft(
      { value: original },
      mine,
      remote,
      (path) => mergeField(path, fields)?.type === 'block',
    )
    expect(plan.conflicts.map((item) => item.path)).toEqual([['hero']])
    expect(plan.resolve({ 0: 'remote' })).toEqual(remote)
  })
  it('distinguishes removed values, nulls and edits within removed objects', () => {
    const original: Record<string, unknown> = {
      optional: null,
      author: { name: 'A' },
      flag: true,
    }
    const plan = mergeDraft(
      { value: original },
      { flag: true },
      { optional: null, author: { name: 'B' }, flag: false },
    )
    expect(plan.conflicts).toEqual([
      {
        path: ['author'],
        mine: { exists: false },
        remote: { exists: true, value: { name: 'B' } },
        original: { exists: true, value: { name: 'A' } },
      },
    ])
    expect(plan.resolve({ 0: 'mine' })).toEqual({ flag: false })
    expect(plan.resolve({ 0: 'remote' })).toEqual({
      author: { name: 'B' },
      flag: false,
    })
  })
  it('conflicts on competing additions and respects matching removals', () => {
    const plan = mergeDraft<Record<string, unknown>>(
      { value: { old: 1 } },
      { added: 'Mine' },
      { added: 'GitHub' },
    )
    expect(plan.conflicts.map((item) => item.path)).toEqual([['added']])
    expect(plan.resolve({ 0: 'remote' })).toEqual({ added: 'GitHub' })
  })
  it('treats raw source and older drafts without baselines as whole values', () => {
    expect(
      mergeDraft({ value: 'original' }, 'mine', 'remote').conflicts[0].path,
    ).toEqual([])
    const plan = mergeDraft(
      undefined,
      { title: 'Mine', date: 'Old' },
      { title: 'Old', date: 'New' },
    )
    expect(plan.conflicts).toHaveLength(1)
    expect(plan.conflicts[0].original).toBeUndefined()
    expect(plan.resolve({ 0: 'remote' })).toEqual({ title: 'Old', date: 'New' })
  })
  it('uses configured labels for nested paths', () => {
    expect(
      conflictLabel(
        ['author', 'email'],
        [
          {
            name: 'author',
            label: 'Author',
            fields: [{ name: 'email', label: 'Email address' }],
          },
        ],
        'Entry',
      ),
    ).toBe('Author › Email address')
    expect(conflictLabel([], [], 'Items')).toBe('Items')
  })
  it('preserves data keys without prototype assignment', () => {
    const data = JSON.parse('{"__proto__":{"title":"Original"}}') as Record<
      string,
      unknown
    >
    const mine = JSON.parse('{"__proto__":{"title":"Mine"}}') as Record<
      string,
      unknown
    >
    const result = mergeDraft({ value: data }, mine, data).resolve({})
    expect(Object.hasOwn(result, '__proto__')).toBe(true)
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype)
  })
})
