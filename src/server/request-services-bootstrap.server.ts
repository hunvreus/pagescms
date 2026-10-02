import {
  createDeploymentServices,
  createRequestServices,
  createRequestServicesAccessor,
} from './request-services.server'
import { createDatabaseFromSource } from './database/client.server'
import { parseRuntimeConfiguration } from './runtime-config.server'

import type { Database } from './database/client.server'
import type { PagesCmsServerServices } from '#/deployment/contracts/server.server'

const databases = new Map<string, Database>()
let deploymentServices: PagesCmsServerServices | undefined

function getDeploymentServices(environment: unknown) {
  deploymentServices ??= createDeploymentServices(environment)
  return deploymentServices
}

function getDatabase(environment: unknown) {
  const source = parseRuntimeConfiguration(environment).database
  if (source.kind !== 'libsql') {
    throw new Error('D1 bindings require the Cloudflare request bootstrap')
  }
  const key = JSON.stringify([source.url, source.authToken ?? ''])
  let database = databases.get(key)
  if (!database) {
    database = createDatabaseFromSource(source)
    databases.set(key, database)
  }
  return database
}

function getCacheDatabase(environment: unknown) {
  const source = parseRuntimeConfiguration(environment).cacheDatabase
  if (source.kind !== 'libsql') {
    throw new Error('D1 bindings require the Cloudflare request bootstrap')
  }
  const key = JSON.stringify([source.url, source.authToken ?? ''])
  let database = databases.get(key)
  if (!database) {
    database = createDatabaseFromSource(source)
    databases.set(key, database)
  }
  return database
}

export function createRequestServicesForRequest(request: Request) {
  return createRequestServices(process.env, request.headers, {
    database: getDatabase(process.env),
    cacheDatabase: getCacheDatabase(process.env),
    deploymentServices: getDeploymentServices(process.env),
  })
}

export function createRequestServicesAccessorForRequest(request: Request) {
  return createRequestServicesAccessor(() =>
    createRequestServicesForRequest(request),
  )
}
