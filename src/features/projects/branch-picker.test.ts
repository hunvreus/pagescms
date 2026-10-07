import { describe, expect, it } from 'vitest'
import { canCreateBranch, compactBranches } from './branch-picker'

describe('branch picker', () => {
  it('keeps current and default branches first and limits the menu to five', () => {
    expect(
      compactBranches(['a', 'b', 'c', 'd', 'e', 'main'], 'topic', 'main'),
    ).toEqual(['topic', 'main', 'a', 'b', 'c'])
    expect(compactBranches(['a', 'main'], 'main', 'main')).toEqual([
      'main',
      'a',
    ])
  })
  it('allows only new valid branch names', () => {
    expect(canCreateBranch(' feature/new ', ['main'])).toBe(true)
    for (const value of ['main', ' main ', '', 'bad name', 'feature..bad'])
      expect(canCreateBranch(value, ['main'])).toBe(false)
  })
})
