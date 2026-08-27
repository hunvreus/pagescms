import { serverPluginRegistry } from '#/plugins/server-discovery.server'

import { createAccessPolicyGateway } from './access-policy.server'
import { createPagesCmsAuth } from './auth.server'
import { createDatabase } from './database/client.server'
import { createProjectService } from './projects.server'
import { createRepositoryAccessService } from './repository-access.server'
import { parseRuntimeConfiguration } from './runtime-config.server'

import type { GitHubApiFactory } from './github-api.server'
import type { Database } from './database/client.server'

export function createRequestServices(
  environment: unknown,
  requestHeaders: Headers,
  dependencies: {
    database?: Database
    githubApiFactory?: GitHubApiFactory
  } = {},
) {
  const configuration = parseRuntimeConfiguration(environment)
  const database =
    dependencies.database ??
    createDatabase({
      connectionString: configuration.databaseConnectionString,
    })
  const access = createAccessPolicyGateway({
    deployment: configuration.deployment,
    policy: serverPluginRegistry.accessPolicy,
  })
  const repositoryAccess = createRepositoryAccessService(
    database,
    configuration.githubApp,
    dependencies.githubApiFactory,
  )
  const projects = createProjectService(
    database,
    repositoryAccess,
    dependencies.githubApiFactory,
  )
  const emailProvider = serverPluginRegistry.createEmailProvider?.(environment)
  const auth = createPagesCmsAuth({
    database,
    configuration: configuration.auth,
    emailProvider,
  })
  const getSession = createSessionReader(() =>
    auth.api.getSession({ headers: requestHeaders }),
  )
  const authenticationMethods = {
    email: Boolean(emailProvider),
  } as const

  return {
    access,
    auth,
    authenticationMethods,
    configuration,
    database,
    emailProvider,
    getSession,
    projects,
    repositoryAccess,
  }
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
