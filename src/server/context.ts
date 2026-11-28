import { createGitHubAccountReader } from '#/server/auth/oauth-account'
import { withRepositoryPolicyIdentity } from '#/server/access/repository-identity-policy'
import serverDeployment from '#pagescms/deployment/server'
import { createPagesCmsServerServices } from '#/deployment/contracts/server.server'

import { createAccessPolicyGateway } from '#/server/access/policy'
import { withActivityCapture } from '#/server/activity/capture'
import { createPagesCmsAuth } from '#/server/auth/index'
import { configureCachePolicy, parseCachePolicy } from '#/server/cache/policy'
import { createGitHubApi } from '#/server/github/api'
import { createRepositoryService } from '#/server/repository/repositories'
import { createRepositoryAccessService } from '#/server/access/repository'
import { logServerEvent, serverErrorDetails } from '#/server/http'
import {
  parseRuntimeConfiguration,
  sameDatabaseSource,
} from '#/server/runtime-config'

import type { GitHubApiFactory } from '#/server/github/api'
import type { PagesCmsAuth } from '#/server/auth/index'
import type { CachePolicy } from '#/server/cache/policy'
import type {
  AuthRuntimeConfiguration,
  RuntimeConfiguration,
} from '#/server/runtime-config'
import type { Database } from '#/server/db/client'
import type { PagesCmsServerServices } from '#/deployment/contracts/server.server'
import type { InstallationLookup } from '#/server/collaborators/collaborators'

const authInstances = new WeakMap<
  PagesCmsServerServices,
  WeakMap<
    Database,
    Array<{ configuration: AuthRuntimeConfiguration; auth: PagesCmsAuth }>
  >
>()

function cachedAuth(
  deploymentServices: PagesCmsServerServices | undefined,
  database: Database,
  configuration: AuthRuntimeConfiguration,
  create: () => PagesCmsAuth,
) {
  if (!deploymentServices) return create()
  let byDatabase = authInstances.get(deploymentServices)
  if (!byDatabase) {
    byDatabase = new WeakMap()
    authInstances.set(deploymentServices, byDatabase)
  }
  let byConfiguration = byDatabase.get(database)
  if (!byConfiguration) {
    byConfiguration = []
    byDatabase.set(database, byConfiguration)
  }
  const cached = byConfiguration.find(
    ({ configuration: current }) =>
      current.baseUrl === configuration.baseUrl &&
      current.secret === configuration.secret &&
      current.defaultLanguage === configuration.defaultLanguage &&
      current.sessionCacheSeconds === configuration.sessionCacheSeconds &&
      current.clientIpHeader === configuration.clientIpHeader &&
      current.github?.clientId === configuration.github?.clientId &&
      current.github?.clientSecret === configuration.github?.clientSecret &&
      current.google?.clientId === configuration.google?.clientId &&
      current.google?.clientSecret === configuration.google?.clientSecret,
  )
  if (cached) return cached.auth
  const auth = create()
  byConfiguration.push({ configuration, auth })
  return auth
}

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
    installationLookup?: InstallationLookup
    authClientIpHeader?: string
    runtimeConfiguration?: RuntimeConfiguration
    cacheSettings?: CachePolicy
    auth?: PagesCmsAuth
    waitUntil?: (promise: Promise<unknown>) => void
    responseHeaders?: Headers
  } = {},
) {
  const configuration =
    dependencies.runtimeConfiguration ?? parseRuntimeConfiguration(environment)
  const authConfiguration = {
    ...configuration.auth,
    defaultLanguage: configuration.defaultLanguage,
    ...(dependencies.authClientIpHeader
      ? { clientIpHeader: dependencies.authClientIpHeader }
      : {}),
  }
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
  const cacheSettings =
    dependencies.cacheSettings ?? parseCachePolicy(environment)
  configureCachePolicy(cacheDatabase, cacheSettings)
  const githubApiFactory =
    dependencies.githubApiFactory ??
    ((token: string, repository?: { id: number; nodeId?: string }) =>
      createGitHubApi(
        token,
        fetch,
        cacheSettings.repositoryMs,
        cacheSettings.branchHeadMs,
        repository,
      ))
  const emailProvider = deploymentServices.emailProvider
  const mediaProviderResolver = deploymentServices.mediaProviderResolver
  let requestAuth: PagesCmsAuth | undefined = dependencies.auth
  const getAuth = () =>
    (requestAuth ??= cachedAuth(
      dependencies.deploymentServices ? deploymentServices : undefined,
      database,
      authConfiguration,
      () =>
        createPagesCmsAuth({
          database,
          configuration: authConfiguration,
          emailProvider,
          extension: deploymentServices.authExtension,
        }),
    ))
  const readGitHubAccount = createGitHubAccountReader(
    database,
    authConfiguration.secret,
  )
  const repositoryAccess = createRepositoryAccessService({
    database,
    cacheDatabase,
    githubApp: configuration.githubApp,
    githubApiFactory,
    readGitHubAccount,
    waitUntil: dependencies.waitUntil,
  })
  const access = withActivityCapture(
    withRepositoryPolicyIdentity(
      createAccessPolicyGateway({
        required: configuration.requireAccessPolicy,
        policy: deploymentServices.accessPolicy,
      }),
      database,
      Boolean(deploymentServices.accessPolicy),
    ),
    database,
    cacheDatabase,
    dependencies.waitUntil,
    repositoryAccess.configurationStore,
  )
  const repositories = createRepositoryService(
    database,
    cacheDatabase,
    repositoryAccess,
    readGitHubAccount,
    githubApiFactory,
    dependencies.waitUntil,
  )
  // GitHub profiles are synchronized when a session is created, not on reads.
  const getSession = createSessionReader(async () => {
    if (!requestHeaders.has('cookie') && !requestHeaders.has('authorization'))
      return null
    if (!dependencies.responseHeaders)
      return getAuth().api.getSession({ headers: requestHeaders })
    const { response, headers } = await getAuth().api.getSession({
      headers: requestHeaders,
      returnHeaders: true,
    })
    for (const cookie of headers.getSetCookie())
      dependencies.responseHeaders.append('set-cookie', cookie)
    return response
  })
  async function refreshSession() {
    if (!dependencies.responseHeaders) return
    try {
      const { headers } = await getAuth().api.getSession({
        headers: requestHeaders,
        query: { disableCookieCache: true },
        returnHeaders: true,
      })
      for (const cookie of headers.getSetCookie())
        dependencies.responseHeaders.append('set-cookie', cookie)
    } catch (error) {
      logServerEvent('error', {
        event: 'session_refresh_failed',
        ...serverErrorDetails(error),
      })
    }
  }
  const authenticationMethods = {
    email: Boolean(emailProvider),
  } as const

  return {
    access,
    get auth() {
      return getAuth()
    },
    authenticationMethods,
    pluginRoutes: deploymentServices.pluginRoutes,
    pluginHandlers: deploymentServices.pluginHandlers,
    ...(deploymentServices.revokeCredentials
      ? { revokeCredentials: deploymentServices.revokeCredentials }
      : {}),
    beforeAccountDelete: deploymentServices.beforeAccountDelete,
    configuration,
    configurationStore: repositoryAccess.configurationStore,
    database,
    cacheDatabase,
    emailProvider,
    getSession,
    refreshSession,
    waitUntil: dependencies.waitUntil,
    githubApiFactory,
    installationLookup: dependencies.installationLookup,
    mediaProviderResolver,
    repositories,
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
