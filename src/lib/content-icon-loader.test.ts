import { describe, expect, it } from 'vitest'
import { loadContentIcon } from './content-icon-loader'

describe('configured icons', () => {
  it('returns no node for unknown names or object prototype keys', async () => {
    expect(await loadContentIcon('not-a-real-icon')).toBeUndefined()
    expect(await loadContentIcon('toString')).toBeUndefined()
  })
  it('shares loads and resolves real local icon nodes', async () => {
    const first = loadContentIcon('newspaper')
    expect(loadContentIcon('newspaper')).toBe(first)
    expect(await first).toEqual(expect.any(Array))
  })
})
