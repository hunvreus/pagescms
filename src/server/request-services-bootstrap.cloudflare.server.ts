import { env } from 'cloudflare:workers'

import {
  createDeploymentServices,
  createRequestServices,
  createRequestServicesAccessor,
} from './request-services.server'
import { createD1Database } from './database/core.server'

import type { Database } from './database/client.server'
import type { PagesCmsServerServices } from '#/deployment/contracts/server.server'

let database: Database | undefined
let cacheDatabase: Database | undefined
let deploymentServices: PagesCmsServerServices | undefined

function servicesEnvironment() {
  return env as unknown as Record<string, unknown>
}

export function createRequestServicesForRequest(request: Request) {
  const environment = servicesEnvironment()
  const applicationBinding = environment.DATABASE
  if (!applicationBinding) throw new Error('DATABASE D1 binding is required')
  const cacheBinding = environment.CACHE_DATABASE ?? applicationBinding

  database ??= createD1Database(applicationBinding as D1Database)
  cacheDatabase ??=
    cacheBinding === applicationBinding
      ? database
      : createD1Database(cacheBinding as D1Database)
  deploymentServices ??= createDeploymentServices(environment)

  return createRequestServices(environment, request.headers, {
    database,
    cacheDatabase,
    deploymentServices,
  })
}

export function createRequestServicesAccessorForRequest(request: Request) {
  return createRequestServicesAccessor(() =>
    createRequestServicesForRequest(request),
  )
}
