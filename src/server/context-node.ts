import {
  createDeploymentServices,
  createRequestServices,
  createRequestServicesAccessor,
} from '#/server/context'
import { createDatabaseFromSource } from '#/server/db/client'
import { parseCachePolicy } from '#/server/cache/policy'
import { parseRuntimeConfiguration } from '#/server/runtime-config'

import type { Database } from '#/server/db/client'
import type { PagesCmsServerServices } from '#/deployment/contracts/server.server'

const databases = new Map<string, Database>()
let deploymentServices: PagesCmsServerServices | undefined
let runtimeConfiguration:
  ReturnType<typeof parseRuntimeConfiguration> | undefined
let cacheSettings: ReturnType<typeof parseCachePolicy> | undefined

function getDeploymentServices(environment: unknown) {
  deploymentServices ??= createDeploymentServices(environment)
  return deploymentServices
}

function getDatabase(
  source: ReturnType<typeof parseRuntimeConfiguration>['database'],
) {
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

function configurationForRequest() {
  return (runtimeConfiguration ??= parseRuntimeConfiguration(process.env))
}

export function getPublicBaseUrl() {
  return configurationForRequest().auth.baseUrl
}

export function createRequestServicesForRequest(
  request: Request,
  responseHeaders?: Headers,
  waitUntil?: (promise: Promise<unknown>) => void,
) {
  const configuration = configurationForRequest()
  return createRequestServices(process.env, request.headers, {
    database: getDatabase(configuration.database),
    cacheDatabase: getDatabase(configuration.cacheDatabase),
    deploymentServices: getDeploymentServices(process.env),
    runtimeConfiguration: configuration,
    cacheSettings: (cacheSettings ??= parseCachePolicy(process.env)),
    responseHeaders,
    waitUntil:
      waitUntil ??
      ((promise) => {
        void promise
      }),
  })
}

export function createRequestServicesAccessorForRequest(
  request: Request,
  responseHeaders?: Headers,
  waitUntil?: (promise: Promise<unknown>) => void,
) {
  return createRequestServicesAccessor(() =>
    createRequestServicesForRequest(request, responseHeaders, waitUntil),
  )
}

export function getPluginHandlers() {
  return getDeploymentServices(process.env).pluginHandlers
}
