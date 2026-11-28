import { describe, expect, it, vi } from 'vitest'

import { composeServerPlugins, matchPluginHandler } from './compose.server'

import type {
  PluginHandler,
  PluginHandlerMethod,
  ServerPluginServices,
} from './server'

function compose(...extensions: ServerPluginServices[]) {
  return composeServerPlugins(
    extensions.map((services, index) => ({
      id: `extension-${index}`,
      create: () => services,
    })),
    {},
  )
}

function handler(path: string): PluginHandler {
  return {
    path,
    methods: ['GET', 'POST'],
    handle: vi.fn(async () => new Response('extension')),
  }
}

describe('mounted deployment handlers', () => {
  it('leaves a standalone deployment without mounted handlers or auth additions', () => {
    const services = compose()
    expect(services.pluginHandlers).toEqual([])
    expect(services.authExtension.plugins).toEqual([])
    expect(services.authExtension.schema).toEqual({})
  })

  it('matches exact routes and descendants without matching a neighboring prefix', () => {
    const services = compose({
      handlers: [
        handler('/mcp'),
        handler('/api/v1/*'),
        handler('/.well-known/oauth-protected-resource/mcp'),
      ],
    })
    const match = (path: string) =>
      matchPluginHandler(services.pluginHandlers, path)?.path

    expect(match('/mcp')).toBe('/mcp')
    expect(match('/mcp/other')).toBeUndefined()
    expect(match('/api/v1')).toBe('/api/v1/*')
    expect(match('/api/v1/repositories/123')).toBe('/api/v1/*')
    expect(match('/api/v10/repositories/123')).toBeUndefined()
    expect(match('/.well-known/oauth-protected-resource/mcp')).toBe(
      '/.well-known/oauth-protected-resource/mcp',
    )
    expect(match('/owner/repository/main')).toBeUndefined()
  })

  it.each([
    '/api/auth/*',
    '/api/plugins/*',
    '/api/webhook/github',
    '/api/health',
    '/api/session',
    '/api/dashboard',
    '/api/repositories',
    '/api/repository',
    '/api/branches',
    '/api/collections',
    '/api/entries',
    '/api/configuration',
    '/api/files',
    '/api/media',
    '/api/actions',
    '/api/activity',
    '/api/references',
    '/api/account/language',
    '/api/*',
    '/assets/*',
    '/_serverFn/*',
  ])('rejects a handler shadowing core at %s', (path) => {
    expect(() => compose({ handlers: [handler(path)] })).toThrow('Reserved')
  })

  it.each([
    '/owner/*',
    '/github/owner/repo/main',
    '/api/v1/../auth',
    '/api//v1',
  ])('rejects an unsafe or editor-shadowing path %s', (path) => {
    expect(() => compose({ handlers: [handler(path)] })).toThrow()
  })

  it('rejects overlapping mounts across extensions', () => {
    expect(() =>
      compose(
        { handlers: [handler('/api/v1/*')] },
        { handlers: [handler('/api/v1/entries')] },
      ),
    ).toThrow('Conflicting')
    expect(() =>
      compose({ handlers: [handler('/mcp')] }, { handlers: [handler('/mcp')] }),
    ).toThrow('Conflicting')
  })

  it('retains a snapshot of the registered methods', () => {
    const methods: PluginHandlerMethod[] = ['POST']
    const services = compose({ handlers: [{ ...handler('/mcp'), methods }] })
    methods.push('GET')
    expect(services.pluginHandlers[0].methods).toEqual(['POST'])
    expect(Object.isFrozen(services.pluginHandlers)).toBe(true)
  })
})

describe('authentication extensions', () => {
  it('composes providers and their tables in deployment order', () => {
    const first = { id: 'provider-one' }
    const second = { id: 'provider-two' }
    const table = {}
    const services = compose(
      { auth: { plugins: [first], schema: { customClient: table } } },
      { auth: { plugins: [second] } },
    )
    expect(services.authExtension.plugins).toEqual([first, second])
    expect(services.authExtension.schema.customClient).toBe(table)
    expect(Object.isFrozen(services.authExtension.plugins)).toBe(true)
  })

  it.each(['email-otp'])(
    'rejects replacement of built-in auth plugin %s',
    (id) => {
      expect(() => compose({ auth: { plugins: [{ id }] } })).toThrow(
        'Duplicate auth plugin',
      )
    },
  )

  it('rejects duplicate contributed providers and models', () => {
    expect(() =>
      compose(
        { auth: { plugins: [{ id: 'provider' }] } },
        { auth: { plugins: [{ id: 'provider' }] } },
      ),
    ).toThrow('Duplicate auth plugin')
    expect(() =>
      compose(
        { auth: { schema: { customClient: {} } } },
        { auth: { schema: { customClient: {} } } },
      ),
    ).toThrow('Conflicting auth model')
  })

  it.each(['user', 'session', 'account', 'verification'])(
    'rejects replacement of core auth model %s',
    (model) => {
      expect(() => compose({ auth: { schema: { [model]: {} } } })).toThrow(
        'Conflicting auth model',
      )
    },
  )
})
