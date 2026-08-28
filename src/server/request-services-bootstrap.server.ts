import {
  createDeploymentServices,
  createRequestServices,
  createRequestServicesAccessor,
} from './request-services.server'
import { createDatabase } from './database/client.server'
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
  const connectionString =
    parseRuntimeConfiguration(environment).databaseConnectionString
  let database = databases.get(connectionString)
  if (!database) {
    database = createDatabase({ connectionString })
    databases.set(connectionString, database)
  }
  return database
}

export function createRequestServicesForRequest(request: Request) {
  return createRequestServices(process.env, request.headers, {
    database: getDatabase(process.env),
    deploymentServices: getDeploymentServices(process.env),
  })
}

export function createRequestServicesAccessorForRequest(request: Request) {
  return createRequestServicesAccessor(() =>
    createRequestServicesForRequest(request),
  )
}
