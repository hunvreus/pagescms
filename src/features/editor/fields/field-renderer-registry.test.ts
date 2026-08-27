import { describe, expect, it, vi } from 'vitest'

import { createFieldRendererRegistry } from './field-renderer-registry'

describe('field renderer registry', () => {
  it('resolves a registered renderer by field type', () => {
    const stringRenderer = vi.fn(() => null)
    const registry = createFieldRendererRegistry({ string: stringRenderer })

    expect(registry.get('string')).toBe(stringRenderer)
  })

  it('uses the string renderer for an unknown core field type', () => {
    const stringRenderer = vi.fn(() => null)
    const registry = createFieldRendererRegistry({ string: stringRenderer })

    expect(registry.resolve('future-field')).toBe(stringRenderer)
  })

  it('allows a trusted renderer to be added without changing editor code', () => {
    const stringRenderer = vi.fn(() => null)
    const pluginRenderer = vi.fn(() => null)
    const registry = createFieldRendererRegistry({ string: stringRenderer })

    registry.register('color', pluginRenderer)

    expect(registry.resolve('color')).toBe(pluginRenderer)
  })
})
