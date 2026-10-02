import serverDeployment from '#pagescms/deployment/server'
import { createPagesCmsServerServices } from '#/deployment/contracts/server.server'

import { createAccessPolicyGateway } from './access-policy.server'
import { createPagesCmsAuth } from './auth.server'
import { configureCachePolicy, parseCachePolicy } from './cache-policy.server'
import { createGitHubApi } from './github-api.server'
import { syncGitHubProfile } from './github-account.server'
import { logServerEvent, serverErrorDetails } from './http'
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
  const getSession = createSessionReader(async () => {
    const session = await auth.api.getSession({ headers: requestHeaders })
    if (!session?.user || session.user.githubUsername) return session

    try {
      const profile = await syncGitHubProfile(database, session.user.id)
      if (!profile) return session
      return {
        ...session,
        user: {
          ...session.user,
          ...profile,
        },
      }
    } catch (error) {
      logServerEvent('error', {
        event: 'github_profile_sync_failed',
        userId: session.user.id,
        ...serverErrorDetails(error),
      })
      return session
    }
  })
  const authenticationMethods = {
    email: Boolean(emailProvider),
  } as const

  return {
    access,
    auth,
    authenticationMethods,
    billingWebhook,
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
