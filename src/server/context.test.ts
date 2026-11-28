import * as databaseSql from '#/server/db/sql'
import { describe, expect, it, vi } from 'vitest'

import { createRequestServices } from '#/server/context'
import { createDatabase } from '#/server/db/client'

describe('createRequestServices', () => {
  it('does not synchronize a GitHub profile on email-only session reads', async () => {
    const database = createDatabase({ url: 'file::memory:' })
    const services = createRequestServices(
      {
        BETTER_AUTH_SECRET: 'a-secure-auth-secret-with-32-characters',
        BETTER_AUTH_URL: 'https://app.pagescms.org',
        DATABASE_URL: 'file::memory:',
      },
      new Headers({ cookie: 'better-auth.session_token=test' }),
      { database, cacheDatabase: database },
    )
    const load = vi
      .spyOn(services.auth.api, 'getSession')
      .mockImplementation(
        async () =>
          ({ user: { id: 'email-user', githubUsername: null } }) as never,
      )
    const account = vi.spyOn(databaseSql, 'first')
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
    expect(services.configuration.requireAccessPolicy).toBe(false)
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
          emailProvider: undefined,
          mediaProviderResolver: undefined,
          pluginRoutes: {},
          pluginHandlers: [],
          authExtension: { plugins: [], schema: {} },
          beforeAccountDelete: async () => {},
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
    expect(services.pluginRoutes).toBeDefined()
    expect(services.beforeAccountDelete).toBeDefined()
  })

  it('reuses one auth instance per deployment, database and auth settings', () => {
    const database = createDatabase({ url: 'file::memory:' })
    const deploymentServices = {
      accessPolicy: undefined,
      emailProvider: undefined,
      mediaProviderResolver: undefined,
      pluginRoutes: {},
      pluginHandlers: [],
      authExtension: { plugins: [], schema: {} },
      beforeAccountDelete: undefined,
    }
    const environment = {
      BETTER_AUTH_SECRET: 'a-secure-auth-secret-with-32-characters',
      BETTER_AUTH_URL: 'https://app.pagescms.org',
      DATABASE_URL: 'file::memory:',
    }
    const create = (env: Record<string, string>) =>
      createRequestServices(env, new Headers(), {
        database,
        cacheDatabase: database,
        deploymentServices,
      }).auth
    expect(create(environment)).toBe(create(environment))
    expect(
      create({
        ...environment,
        BETTER_AUTH_SECRET:
          'rotated-secret-with-at-least-thirty-two-characters',
      }),
    ).not.toBe(create(environment))
    expect(
      create({ ...environment, BETTER_AUTH_URL: 'https://other.example' }),
    ).not.toBe(create(environment))
    expect(
      createRequestServices(environment, new Headers(), {
        database,
        cacheDatabase: database,
      }).auth,
    ).not.toBe(create(environment))
  })
})
