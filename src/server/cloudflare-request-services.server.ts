import { env, waitUntil } from 'cloudflare:workers'

import {
  createRequestServices,
  createRequestServicesAccessor,
} from './request-services.server'

export function createRuntimeRequestServices(request: Request) {
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

export function createRuntimeRequestServicesAccessor(request: Request) {
  return createRequestServicesAccessor(() =>
    createRuntimeRequestServices(request),
  )
}
