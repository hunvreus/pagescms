import serverDeployment from '#pagescms/deployment/server'
import { createPagesCmsServerServices } from '#/deployment/contracts/server.server'

import { createAccessPolicyGateway } from './access-policy.server'
import { createPagesCmsAuth } from './auth.server'
import { configureCachePolicy, parseCachePolicy } from './cache-policy.server'
import { createGitHubApi } from './github-api.server'
import { createProjectService } from './projects.server'
import { createRepositoryAccessService } from './repository-access.server'
import {
  parseRuntimeConfiguration,
  sameDatabaseSource,
} from './runtime-config.server'

import type { GitHubApiFactory } from './github-api.server'
import type { Database } from './database/client.server'
import type { PagesCmsServerServices } from '#/deployment/contracts/server.server'

export function createDeploymentServices(environment: unknown) {
  return createPagesCmsServerServices(serverDeployment, environment)
}

export function createRequestServices(
  environment: unknown,
  requestHeaders: Headers,
  dependencies: {
    database?: Database
    cacheDatabase?: Database
    deploymentServices?: PagesCmsServerServices
    githubApiFactory?: GitHubApiFactory
  } = {},
) {
  const configuration = parseRuntimeConfiguration(environment)
  const deploymentServices =
    dependencies.deploymentServices ?? createDeploymentServices(environment)
  const database = dependencies.database
  if (!database) throw new Error('Application database is required')
  const cacheDatabase =
    dependencies.cacheDatabase ??
    (sameDatabaseSource(configuration.cacheDatabase, configuration.database)
      ? database
      : undefined)
  if (!cacheDatabase) throw new Error('Cache database is required')
  const access = createAccessPolicyGateway({
    deployment: configuration.deployment,
    policy: deploymentServices.accessPolicy,
  })
  const cacheSettings = parseCachePolicy(environment)
  configureCachePolicy(cacheDatabase, cacheSettings)
  const githubApiFactory =
    dependencies.githubApiFactory ??
    ((token: string) =>
      createGitHubApi(token, fetch, cacheSettings.repositoryMs))
  const repositoryAccess = createRepositoryAccessService({
    database,
    cacheDatabase,
    githubApp: configuration.githubApp,
    githubApiFactory,
  })
  const projects = createProjectService(
    database,
    cacheDatabase,
    repositoryAccess,
    githubApiFactory,
  )
  const emailProvider = deploymentServices.emailProvider
  const billingWebhook = deploymentServices.billingWebhook
  const entitlementReader = deploymentServices.entitlementReader
  const mediaProviderResolver = deploymentServices.mediaProviderResolver
  const repositoryPermissionAdmin = deploymentServices.repositoryPermissionAdmin
  const auth = createPagesCmsAuth({
    database,
    configuration: configuration.auth,
    emailProvider,
  })
  // GitHub profiles are synchronized when a session is created, not on reads.
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
    billingWebhook,
    billingSessions: deploymentServices.billingSessions,
    configuration,
    database,
    cacheDatabase,
    emailProvider,
    entitlementReader,
    getSession,
    githubApiFactory,
    mediaProviderResolver,
    projects,
    repositoryAccess,
    repositoryPermissionAdmin,
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
