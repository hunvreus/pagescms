import { createGitHubApi } from '#/server/github-api.server'
import { createDatabase } from '#/server/database/client.server'
import {
  createRequestServices,
  createRequestServicesAccessor,
} from '#/server/request-services.server'

import { githubFixtureFetch } from './github-fixture.server'

let database: ReturnType<typeof createDatabase> | undefined

function testEnvironment() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl)
    throw new Error('DATABASE_URL is required for browser tests')
  return {
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    DATABASE_URL: databaseUrl,
    DEPLOYMENT_MODE: 'self-hosted',
  }
}

export function createRequestServicesForRequest(request: Request) {
  const environment = testEnvironment()
  database ??= createDatabase({
    url: environment.DATABASE_URL,
  })
  return createRequestServices(environment, request.headers, {
    database,
    cacheDatabase: database,
    githubApiFactory: (token) => createGitHubApi(token, githubFixtureFetch),
  })
}

export function createRequestServicesAccessorForRequest(request: Request) {
  return createRequestServicesAccessor(() =>
    createRequestServicesForRequest(request),
  )
}
