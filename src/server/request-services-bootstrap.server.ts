import {
  createRequestServices,
  createRequestServicesAccessor,
} from './request-services.server'
import { createDatabase } from './database/client.server'
import { parseRuntimeConfiguration } from './runtime-config.server'

import type { Database } from './database/client.server'

const databases = new Map<string, Database>()

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
  })
}

export function createRequestServicesAccessorForRequest(request: Request) {
  return createRequestServicesAccessor(() =>
    createRequestServicesForRequest(request),
  )
}
