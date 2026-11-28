import { describe, expect, it, vi } from 'vitest'
import {
  definePagesCmsServerDeployment,
  createPagesCmsServerServices,
} from './server.server'
import { DEPLOYMENT_API_VERSION } from './version'

const configure = (
  plugins: Parameters<typeof definePagesCmsServerDeployment>[0]['plugins'] = [],
) =>
  definePagesCmsServerDeployment({
    apiVersion: DEPLOYMENT_API_VERSION,
    plugins,
  })

describe('static server plugin composition', () => {
  it('creates a standalone application without plugins', () => {
    const services = createPagesCmsServerServices(configure(), {})
    expect(services.accessPolicy).toBeUndefined()
    expect(services.emailProvider).toBeUndefined()
    expect(Object.keys(services.pluginRoutes)).toEqual([])
  })
  it('passes runtime configuration only to server factories', () => {
    const create = vi.fn(() => ({}))
    createPagesCmsServerServices(configure([{ id: 'custom', create }]), {
      token: 'secret',
    })
    expect(create).toHaveBeenCalledWith({ token: 'secret' })
  })
  it('rejects duplicate plugin identities and provider selection', () => {
    const plugin = {
      id: 'one',
      create: () => ({ emailProvider: { send: async () => {} } }),
    }
    expect(() => configure([plugin, plugin])).toThrow('Duplicate plugin')
    expect(() =>
      createPagesCmsServerServices(
        configure([plugin, { ...plugin, id: 'two' }]),
        {},
      ),
    ).toThrow('Multiple email')
  })
  it('runs all deletion guards in registration order and stops on rejection', async () => {
    const calls: number[] = []
    const services = createPagesCmsServerServices(
      configure(
        [1, 2, 3].map((n) => ({
          id: `guard-${n}`,
          create: () => ({
            beforeAccountDelete: async () => {
              calls.push(n)
              if (n === 2) throw new Error('blocked')
            },
          }),
        })),
      ),
      {},
    )
    await expect(
      services.beforeAccountDelete?.({ accountId: 'user' }),
    ).rejects.toThrow('blocked')
    expect(calls).toEqual([1, 2])
  })
  it('rejects incompatible versions and obsolete service bags', () => {
    expect(() => definePagesCmsServerDeployment({ apiVersion: 0 })).toThrow(
      'API version',
    )
    expect(() =>
      definePagesCmsServerDeployment({
        apiVersion: DEPLOYMENT_API_VERSION,
        create: () => ({}),
      } as never),
    ).toThrow('key')
  })
  it('namespaces routes and rejects collisions or unsafe paths', () => {
    const route = {
      method: 'POST' as const,
      path: 'hook',
      access: 'public' as const,
      handle: async () => new Response(),
    }
    const services = createPagesCmsServerServices(
      configure([{ id: 'example', create: () => ({ routes: [route] }) }]),
      {},
    )
    expect(services.pluginRoutes['POST example/hook']).toEqual(route)
    for (const routes of [[route, route], [{ ...route, path: '../other' }]])
      expect(() =>
        createPagesCmsServerServices(
          configure([{ id: 'example', create: () => ({ routes }) }]),
          {},
        ),
      ).toThrow()
  })
})
