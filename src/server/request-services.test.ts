import { describe, expect, it, vi } from 'vitest'

import {
  createRequestServices,
  createRequestServicesAccessor,
  createSessionReader,
} from './request-services.server'

describe('createRequestServices', () => {
  it('builds isolated request services from explicit bindings', () => {
    const services = createRequestServices(
      {
        BETTER_AUTH_SECRET: 'a-secure-auth-secret-with-32-characters',
        BETTER_AUTH_URL: 'https://app.pagescms.org',
        DATABASE_URL: 'postgres://user:password@example.com/pagescms',
      },
      new Headers(),
    )

    expect(services.auth.handler).toBeTypeOf('function')
    expect(services.database.query.sessionTable).toBeDefined()
    expect(services.configuration.deployment).toBe('self-hosted')
  })

  it('uses deployment-level services supplied by the bootstrap', async () => {
    const accessPolicy = {
      authorize: vi.fn(async () => ({ allowed: true as const })),
    }
    const services = createRequestServices(
      {
        BETTER_AUTH_SECRET: 'a-secure-auth-secret-with-32-characters',
        BETTER_AUTH_URL: 'https://app.pagescms.org',
        DATABASE_URL: 'postgres://user:password@example.com/pagescms',
      },
      new Headers(),
      { deploymentServices: { accessPolicy } },
    )

    await services.access.authorize({
      operation: 'repository.read',
      principal: { type: 'anonymous' },
      tenant: { type: 'deployment', id: 'self-hosted' },
    })

    expect(accessPolicy.authorize).toHaveBeenCalledOnce()
    expect(services.emailProvider).toBeUndefined()
  })

  it('creates services lazily and only once per request', () => {
    const factory = vi.fn(() =>
      createRequestServices(
        {
          BETTER_AUTH_SECRET: 'a-secure-auth-secret-with-32-characters',
          BETTER_AUTH_URL: 'https://app.pagescms.org',
          DATABASE_URL: 'postgres://user:password@example.com/pagescms',
        },
        new Headers(),
      ),
    )
    const getServices = createRequestServicesAccessor(factory)

    expect(factory).not.toHaveBeenCalled()
    expect(getServices()).toBe(getServices())
    expect(factory).toHaveBeenCalledOnce()
  })

  it('loads and memoizes a session only when requested', async () => {
    const load = vi.fn(async () => ({ user: { id: 'user-1' } }))
    const getSession = createSessionReader(load)

    expect(load).not.toHaveBeenCalled()
    await expect(getSession()).resolves.toEqual({ user: { id: 'user-1' } })
    expect(getSession()).toBe(getSession())
    expect(load).toHaveBeenCalledOnce()
  })
})
