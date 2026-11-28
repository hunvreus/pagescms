import type { PluginHandler } from '#/plugins/server'
import { dirname, join } from 'node:path'
import { createGitHubApi } from '#/server/github/api'
import { createDatabase } from '#/server/db/client'
import {
  createRequestServices,
  createRequestServicesAccessor,
} from '#/server/context'
import { createGitHubFixtureFetch } from './github-fixture.server'

type Fixture = {
  database: ReturnType<typeof createDatabase>
  fetcher: typeof fetch
}

// Vite may reload this module while a test is active. Keep its fake repository
// and database together for the process lifetime, isolated by seed and test scope.
const fixtureState = globalThis as typeof globalThis & {
  __pagesCmsE2EFixtures?: Map<string, Fixture>
}
const fixtures = (fixtureState.__pagesCmsE2EFixtures ??= new Map())

export function createRequestServicesForRequest(
  request: Request,
  responseHeaders?: Headers,
) {
  const seed = process.env.DATABASE_URL
  if (!seed?.startsWith('file:'))
    throw new Error('Local E2E database is required')
  const scope = request.headers.get('x-pagescms-e2e-scope') ?? 'readiness'
  if (scope !== 'readiness' && !/^[0-9a-f-]{36}$/.test(scope))
    throw new Error('Invalid fixture scope')
  const url =
    scope === 'readiness'
      ? seed
      : `file:${join(dirname(seed.slice(5)), `${scope}.db`)}`
  const fixtureKey = `${seed}:${scope}`
  let fixture = fixtures.get(fixtureKey)
  if (!fixture) {
    fixture = {
      database: createDatabase({ url }),
      fetcher: createGitHubFixtureFetch(
        process.env.PAGESCMS_E2E_GITHUB_METRICS_PATH
          ? `${process.env.PAGESCMS_E2E_GITHUB_METRICS_PATH}.${scope}`
          : undefined,
      ),
    }
    fixtures.set(fixtureKey, fixture)
  }
  const collectionAccess = request.headers.get(
    'x-pagescms-e2e-collection-access',
  )
  return createRequestServices(
    {
      ADMIN_EMAILS: process.env.ADMIN_EMAILS,
      BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
      BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
      DATABASE_URL: url,
      GITHUB_APP_NAME: 'pagescms-fixture',
      ...(request.headers.get('x-pagescms-e2e-github-auth') === 'true'
        ? {
            GITHUB_APP_CLIENT_ID: 'layout-fixture-client',
            GITHUB_APP_CLIENT_SECRET: 'layout-fixture-secret',
          }
        : {}),
    },
    request.headers,
    {
      ...(collectionAccess
        ? {
            deploymentServices: {
              emailProvider: undefined,
              mediaProviderResolver: undefined,
              authExtension: { plugins: [], schema: {} },
              beforeAccountDelete: undefined,
              pluginRoutes: {},
              pluginHandlers: [],
              accessPolicy: {
                async authorize({ operation }) {
                  if (operation !== 'collection.read') return { allowed: true }
                  if (collectionAccess === 'deny')
                    return { allowed: false, reason: 'permission_denied' }
                  return {
                    allowed: true,
                    grant: {
                      deniedOperations: [
                        'entry.create',
                        'entry.update',
                        'entry.rename',
                        'entry.delete',
                      ],
                    },
                  }
                },
              },
            },
          }
        : {}),
      database: fixture.database,
      cacheDatabase: fixture.database,
      installationLookup: async (owner) => ({
        id: 30,
        account: { login: owner, type: 'Organization' },
      }),
      responseHeaders,
      githubApiFactory: (token, repository) =>
        createGitHubApi(
          `${token}:${scope}`,
          fixture.fetcher,
          15_000,
          15_000,
          repository,
        ),
    },
  )
}
export function createRequestServicesAccessorForRequest(
  request: Request,
  responseHeaders?: Headers,
) {
  return createRequestServicesAccessor(() =>
    createRequestServicesForRequest(request, responseHeaders),
  )
}

export function getPluginHandlers(): readonly PluginHandler[] {
  return []
}

export function getPublicBaseUrl() {
  return process.env.BETTER_AUTH_URL!
}
