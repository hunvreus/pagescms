import { dirname, join } from 'node:path'
import { createGitHubApi } from '#/server/github-api.server'
import { createDatabase } from '#/server/database/client.server'
import {
  createRequestServices,
  createRequestServicesAccessor,
} from '#/server/request-services.server'
import { createGitHubFixtureFetch } from './github-fixture.server'

const fixtures = new Map<
  string,
  { database: ReturnType<typeof createDatabase>; fetcher: typeof fetch }
>()

export function createRequestServicesForRequest(request: Request) {
  const seed = process.env.DATABASE_URL
  if (!seed.startsWith('file:'))
    throw new Error('Local E2E database is required')
  const scope = request.headers.get('x-pagescms-e2e-scope') ?? 'readiness'
  if (scope !== 'readiness' && !/^[0-9a-f-]{36}$/.test(scope))
    throw new Error('Invalid fixture scope')
  const url =
    scope === 'readiness'
      ? seed
      : `file:${join(dirname(seed.slice(5)), `${scope}.db`)}`
  let fixture = fixtures.get(scope)
  if (!fixture) {
    fixture = {
      database: createDatabase({ url }),
      fetcher: createGitHubFixtureFetch(
        `${process.env.PAGESCMS_E2E_GITHUB_METRICS_PATH}.${scope}`,
      ),
    }
    fixtures.set(scope, fixture)
  }
  return createRequestServices(
    {
      ADMIN_EMAILS: process.env.ADMIN_EMAILS,
      BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
      BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
      DATABASE_URL: url,
      DEPLOYMENT_MODE: 'self-hosted',
    },
    request.headers,
    {
      database: fixture.database,
      cacheDatabase: fixture.database,
      githubApiFactory: (token) =>
        createGitHubApi(`${token}:${scope}`, fixture.fetcher),
    },
  )
}
export function createRequestServicesAccessorForRequest(request: Request) {
  return createRequestServicesAccessor(() =>
    createRequestServicesForRequest(request),
  )
}
