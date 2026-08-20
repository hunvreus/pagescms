import { env, waitUntil } from 'cloudflare:workers'

import { createGitHubApi } from '#/server/github-api.server'
import {
  createRequestServices,
  createRequestServicesAccessor,
} from '#/server/request-services.server'

import { githubFixtureFetch } from './github-fixture.server'

export function createCloudflareRequestServices(request: Request) {
  return createRequestServices(
    env,
    { defer: (task) => waitUntil(task) },
    request.headers,
    {
      githubApiFactory: (token) => createGitHubApi(token, githubFixtureFetch),
    },
  )
}

export function createCloudflareRequestServicesAccessor(request: Request) {
  return createRequestServicesAccessor(() =>
    createCloudflareRequestServices(request),
  )
}
