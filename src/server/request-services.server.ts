import { serverPluginRegistry } from '#/plugins/server-discovery.server'

import { createAccessPolicyGateway } from './access-policy.server'
import { createPagesCmsAuth } from './auth.server'
import { createDatabase } from './database/client.server'
import { parseRuntimeConfiguration } from './runtime-config.server'

import type { BackgroundExecutor } from './runtime-ports.server'

export function createRequestServices(
  environment: unknown,
  background: BackgroundExecutor,
  requestHeaders: Headers,
) {
  const configuration = parseRuntimeConfiguration(environment)
  const database = createDatabase({
    connectionString: configuration.databaseConnectionString,
  })
  const access = createAccessPolicyGateway({
    deployment: configuration.deployment,
    policy: serverPluginRegistry.accessPolicy,
  })
  const auth = createPagesCmsAuth({
    database,
    configuration: configuration.auth,
    background,
    emailProvider: serverPluginRegistry.emailProvider,
  })
  const getSession = createSessionReader(() =>
    auth.api.getSession({ headers: requestHeaders }),
  )

  return { access, auth, configuration, database, getSession }
}

export type RequestServices = ReturnType<typeof createRequestServices>

export function createRequestServicesAccessor(
  factory: () => RequestServices,
): () => RequestServices {
  let services: RequestServices | undefined

  return () => {
    services ??= factory()
    return services
  }
}

export function createSessionReader<T>(
  load: () => Promise<T>,
): () => Promise<T> {
  let session: Promise<T> | undefined

  return () => {
    session ??= load()
    return session
  }
}
