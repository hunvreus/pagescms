import { describe, expect, it, vi } from 'vitest'

import {
  createRequestServices,
  createRequestServicesAccessor,
  createSessionReader,
} from './request-services.server'
import { createDatabase } from './database/client.server'

describe('createRequestServices', () => {
  it('does not synchronize a GitHub profile on email-only session reads', async () => {
    const database = createDatabase({ url: 'file::memory:' })
    const services = createRequestServices(
      {
        BETTER_AUTH_SECRET: 'a-secure-auth-secret-with-32-characters',
        BETTER_AUTH_URL: 'https://app.pagescms.org',
        DATABASE_URL: 'file::memory:',
      },
      new Headers(),
      { database, cacheDatabase: database },
    )
    const load = vi
      .spyOn(services.auth.api, 'getSession')
      .mockImplementation(
        async () =>
          ({ user: { id: 'email-user', githubUsername: null } }) as never,
      )
    const account = vi.spyOn(database.query.accountTable, 'findFirst')
    const user = vi.spyOn(database.query.userTable, 'findFirst')
    await services.getSession()
    await services.getSession()
    expect(load).toHaveBeenCalledOnce()
    expect(account).not.toHaveBeenCalled()
    expect(user).not.toHaveBeenCalled()
    load.mockRestore()
    account.mockRestore()
    user.mockRestore()
  })
  it('builds isolated request services from explicit bindings', () => {
    const database = createDatabase({ url: 'file::memory:' })
    const services = createRequestServices(
      {
        BETTER_AUTH_SECRET: 'a-secure-auth-secret-with-32-characters',
        BETTER_AUTH_URL: 'https://app.pagescms.org',
        DATABASE_URL: 'file::memory:',
      },
      new Headers(),
      { database, cacheDatabase: database },
    )

    expect(services.auth.handler).toBeTypeOf('function')
    expect(services.database.query.sessionTable).toBeDefined()
    expect(services.configuration.deployment).toBe('self-hosted')
  })

  it('uses deployment-level services supplied by the bootstrap', async () => {
    const database = createDatabase({ url: 'file::memory:' })
    const accessPolicy = {
      authorize: vi.fn(async () => ({ allowed: true as const })),
    }
    const services = createRequestServices(
      {
        BETTER_AUTH_SECRET: 'a-secure-auth-secret-with-32-characters',
        BETTER_AUTH_URL: 'https://app.pagescms.org',
        DATABASE_URL: 'file::memory:',
      },
      new Headers(),
      {
        database,
        cacheDatabase: database,
        deploymentServices: {
          accessPolicy,
          billingWebhook: { handle: async () => undefined },
          entitlementReader: { read: async () => null },
          repositoryPermissionAdmin: {
            read: async () => ({ version: '1', roles: [], assignments: [] }),
            replace: async () => ({ version: '2', roles: [], assignments: [] }),
          },
        },
      },
    )

    await services.access.authorize({
      operation: 'repository.read',
      principal: { type: 'anonymous' },
      tenant: { type: 'deployment', id: 'self-hosted' },
    })

    expect(accessPolicy.authorize).toHaveBeenCalledOnce()
    expect(services.emailProvider).toBeUndefined()
    expect(services.billingWebhook).toBeDefined()
    expect(services.entitlementReader).toBeDefined()
    expect(services.repositoryPermissionAdmin).toBeDefined()
  })

  it('creates services lazily and only once per request', () => {
    const database = createDatabase({ url: 'file::memory:' })
    const factory = vi.fn(() =>
      createRequestServices(
        {
          BETTER_AUTH_SECRET: 'a-secure-auth-secret-with-32-characters',
          BETTER_AUTH_URL: 'https://app.pagescms.org',
          DATABASE_URL: 'file::memory:',
        },
        new Headers(),
        { database, cacheDatabase: database },
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
