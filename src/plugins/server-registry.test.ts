import { describe, expect, it } from 'vitest'

import { PLUGIN_API_VERSION } from './contract'
import {
  ServerPluginConfigurationError,
  createServerPluginRegistry,
} from './server-registry.server'

import type { AccessPolicy } from '#/server/access-policy.server'

const policy: AccessPolicy = {
  authorize: async () => ({ allowed: true }),
}

describe('server plugin registry', () => {
  it('registers one hosted access-policy provider', () => {
    const registry = createServerPluginRegistry(
      {
        '/plugins/enterprise/server.ts': {
          default: {
            apiVersion: PLUGIN_API_VERSION,
            pluginId: 'enterprise-access',
            accessPolicy: policy,
          },
        },
      },
      new Set(['enterprise-access']),
    )

    expect(registry.accessPolicy).toBe(policy)
    expect(registry.contributions).toHaveLength(1)
  })

  it('rejects server contributions without a matching manifest', () => {
    expect(() =>
      createServerPluginRegistry(
        {
          '/plugins/unknown/server.ts': {
            default: {
              apiVersion: PLUGIN_API_VERSION,
              pluginId: 'unknown',
              accessPolicy: policy,
            },
          },
        },
        new Set(),
      ),
    ).toThrow('matching plugin manifest')
  })

  it('rejects incompatible versions and multiple policy providers', () => {
    expect(() =>
      createServerPluginRegistry(
        {
          '/plugins/old/server.ts': {
            default: {
              apiVersion: 99,
              pluginId: 'old-plugin',
              accessPolicy: policy,
            },
          },
        },
        new Set(['old-plugin']),
      ),
    ).toThrow('unsupported API version')

    expect(() =>
      createServerPluginRegistry(
        {
          '/plugins/one/server.ts': {
            default: {
              apiVersion: PLUGIN_API_VERSION,
              pluginId: 'one',
              accessPolicy: policy,
            },
          },
          '/plugins/two/server.ts': {
            default: {
              apiVersion: PLUGIN_API_VERSION,
              pluginId: 'two',
              accessPolicy: policy,
            },
          },
        },
        new Set(['one', 'two']),
      ),
    ).toThrow('Multiple access-policy providers')
  })

  it('rejects malformed access-policy capabilities', () => {
    expect(() =>
      createServerPluginRegistry(
        {
          '/plugins/bad/server.ts': {
            default: {
              apiVersion: PLUGIN_API_VERSION,
              pluginId: 'bad',
              accessPolicy: {},
            },
          },
        },
        new Set(['bad']),
      ),
    ).toThrow(ServerPluginConfigurationError)
  })
})
