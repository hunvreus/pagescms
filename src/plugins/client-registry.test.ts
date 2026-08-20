import { describe, expect, it } from 'vitest'

import { createClientPluginRegistry } from './client-registry'

const Field = () => null

describe('client plugin registry', () => {
  it('registers custom fields with a matching manifest', () => {
    const registry = createClientPluginRegistry(
      {
        '/plugins/editor/client.ts': {
          default: {
            apiVersion: 1,
            pluginId: 'editor',
            fields: { color: Field },
          },
        },
      },
      new Set(['editor']),
    )
    expect(registry.getField('color')).toBe(Field)
  })

  it('rejects unknown manifests and duplicate field names', () => {
    expect(() =>
      createClientPluginRegistry(
        {
          '/plugins/unknown/client.ts': {
            default: { apiVersion: 1, pluginId: 'unknown', fields: {} },
          },
        },
        new Set(),
      ),
    ).toThrow('matching plugin manifest')

    expect(() =>
      createClientPluginRegistry(
        {
          '/plugins/one/client.ts': {
            default: {
              apiVersion: 1,
              pluginId: 'one',
              fields: { color: Field },
            },
          },
          '/plugins/two/client.ts': {
            default: {
              apiVersion: 1,
              pluginId: 'two',
              fields: { color: Field },
            },
          },
        },
        new Set(['one', 'two']),
      ),
    ).toThrow('Multiple plugins register field component color')
  })
})
