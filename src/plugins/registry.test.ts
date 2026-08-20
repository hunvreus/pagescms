import { describe, expect, it } from 'vitest'

import { definePlugin } from './contract'
import { createPluginRegistry, PluginConfigurationError } from './registry'

describe('createPluginRegistry', () => {
  it('loads trusted build-time plugins in a stable order', () => {
    const registry = createPluginRegistry({
      '/plugins/zeta/plugin.ts': {
        default: definePlugin({ apiVersion: 1, id: 'zeta', name: 'Zeta' }),
      },
      '/plugins/enterprise/plugin.ts': {
        default: definePlugin({
          apiVersion: 1,
          id: 'enterprise-access',
          name: 'Enterprise access',
        }),
      },
    })

    expect(registry.plugins.map((plugin) => plugin.id)).toEqual([
      'enterprise-access',
      'zeta',
    ])
    expect(registry.get('enterprise-access')?.name).toBe('Enterprise access')
  })

  it('rejects duplicate plugin identifiers', () => {
    expect(() =>
      createPluginRegistry({
        '/plugins/one/plugin.ts': {
          default: definePlugin({ apiVersion: 1, id: 'billing', name: 'One' }),
        },
        '/plugins/two/plugin.ts': {
          default: definePlugin({ apiVersion: 1, id: 'billing', name: 'Two' }),
        },
      }),
    ).toThrowError(new PluginConfigurationError('Duplicate plugin id: billing'))
  })

  it('rejects incompatible API versions before the app starts', () => {
    expect(() =>
      createPluginRegistry({
        '/plugins/future/plugin.ts': {
          default: { apiVersion: 2, id: 'future', name: 'Future' },
        },
      }),
    ).toThrow(/unsupported API version 2/)
  })
})
