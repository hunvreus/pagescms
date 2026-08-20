import { env, waitUntil } from 'cloudflare:workers'

import {
  createRequestServices,
  createRequestServicesAccessor,
} from './request-services.server'

export function createCloudflareRequestServices(request: Request) {
  return createRequestServices(
    env,
    {
      defer(task) {
        waitUntil(task)
      },
    },
    request.headers,
  )
}

export function createCloudflareRequestServicesAccessor(request: Request) {
  return createRequestServicesAccessor(() =>
    createCloudflareRequestServices(request),
  )
}
