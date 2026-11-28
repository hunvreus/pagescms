import { env, waitUntil } from 'cloudflare:workers'

import {
  createDeploymentServices,
  createRequestServices,
  createRequestServicesAccessor,
} from '#/server/context'
import { createD1Database } from '#/server/db/core'
import { createPagesCmsAuth } from '#/server/auth/index'
import { parseCachePolicy } from '#/server/cache/policy'
import { parseRuntimeConfiguration } from '#/server/runtime-config'

const environment = env as unknown as Record<string, unknown>
function initializeServices() {
  const applicationBinding = environment.DATABASE
  if (!applicationBinding) throw new Error('DATABASE D1 binding is required')
  const cacheBinding = environment.CACHE_DATABASE ?? applicationBinding
  const database = createD1Database(applicationBinding as D1Database)
  const cacheDatabase =
    cacheBinding === applicationBinding
      ? database
      : createD1Database(cacheBinding as D1Database)
  const deploymentServices = createDeploymentServices(environment)
  const runtimeConfiguration = parseRuntimeConfiguration(environment)
  const cacheSettings = parseCachePolicy(environment)
  // Auth plugins may use D1 during initialization, which must run in a request.
  const auth = deploymentServices.authExtension.plugins.length
    ? undefined
    : createPagesCmsAuth({
        database,
        configuration: {
          ...runtimeConfiguration.auth,
          clientIpHeader: 'cf-connecting-ip',
        },
        emailProvider: deploymentServices.emailProvider,
        extension: deploymentServices.authExtension,
      })
  return {
    database,
    cacheDatabase,
    deploymentServices,
    runtimeConfiguration,
    cacheSettings,
    auth,
  }
}

// Cloudflare's deployment validation can evaluate modules without bindings.
let services = environment.DATABASE ? initializeServices() : undefined

export function createRequestServicesForRequest(
  request: Request,
  responseHeaders?: Headers,
) {
  const {
    database,
    cacheDatabase,
    deploymentServices,
    runtimeConfiguration,
    cacheSettings,
    auth,
  } = (services ??= initializeServices())
  return createRequestServices(environment, request.headers, {
    database,
    cacheDatabase,
    deploymentServices,
    runtimeConfiguration,
    cacheSettings,
    auth,
    responseHeaders,
    authClientIpHeader: 'cf-connecting-ip',
    waitUntil,
  })
}

export function createRequestServicesAccessorForRequest(
  request: Request,
  responseHeaders?: Headers,
) {
  return createRequestServicesAccessor(() =>
    createRequestServicesForRequest(request, responseHeaders),
  )
}

export function getPluginHandlers() {
  return (services ??= initializeServices()).deploymentServices.pluginHandlers
}

export function getPublicBaseUrl() {
  return (services ??= initializeServices()).runtimeConfiguration.auth.baseUrl
}
