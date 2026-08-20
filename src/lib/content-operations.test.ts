import { describe, expect, it } from 'vitest'

import {
  isContentOperationAllowed,
  resolveContentOperations,
} from './content-operations'

describe('resolveContentOperations', () => {
  it('uses collection defaults when no scope is provided', () => {
    expect(resolveContentOperations({})).toEqual({
      create: true,
      rename: true,
      delete: true,
    })
  })

  it('derives file defaults from the content schema', () => {
    expect(resolveContentOperations({ schema: { type: 'file' } })).toEqual({
      create: true,
      rename: false,
      delete: true,
    })
  })

  it('uses restrictive settings defaults', () => {
    expect(resolveContentOperations({ scope: 'settings' })).toEqual({
      create: true,
      rename: false,
      delete: false,
    })
  })

  it('allows configuration to disable but not broaden scope defaults', () => {
    const schema = {
      type: 'file',
      operations: { create: false, rename: true, delete: false },
    }

    expect(resolveContentOperations({ schema })).toEqual({
      create: false,
      rename: false,
      delete: false,
    })
    expect(isContentOperationAllowed('rename', { schema })).toBe(false)
  })
})
