import { createGitHubApi } from '#/server/github-api.server'
import {
  createRequestServices,
  createRequestServicesAccessor,
} from '#/server/request-services.server'

import { githubFixtureFetch } from './github-fixture.server'

function testEnvironment() {
  return {
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    DATABASE_URL: process.env.DATABASE_URL,
    DEPLOYMENT_MODE: 'self-hosted',
  }
}

export function createRuntimeRequestServices(request: Request) {
  return createRequestServices(
    testEnvironment(),
    { defer: (task) => void task.catch(() => undefined) },
    request.headers,
    {
      githubApiFactory: (token) => createGitHubApi(token, githubFixtureFetch),
    },
  )
}

export function createRuntimeRequestServicesAccessor(request: Request) {
  return createRequestServicesAccessor(() =>
    createRuntimeRequestServices(request),
  )
}
