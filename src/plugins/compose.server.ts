import { authorizePolicyBatch } from '#/server/access/policy'
import { CORE_ROOT_PATHS } from '#/lib/core-route-paths'
import { assertPluginIds, isRecord } from './identity'
import type {
  PluginAuthExtension,
  PluginHandler,
  PluginRoute,
  ServerPlugin,
  ServerPluginServices,
} from './server'
import type {
  AccessPolicy,
  AccessDecision,
  AccessRequest,
  AccessDiscoveryResource,
  AccessGrant,
} from '#/server/access/policy'

function key(resource: AccessDiscoveryResource) {
  return JSON.stringify([resource.type, resource.name])
}

export function composePolicies(
  policies: readonly AccessPolicy[],
): AccessPolicy | undefined {
  if (!policies.length) return undefined
  return {
    async authorize(request) {
      const delegated = new Set<
        NonNullable<AccessGrant['delegatedOperations']>[number]
      >()
      const denied = new Set<
        NonNullable<AccessGrant['deniedOperations']>[number]
      >()
      for (const policy of policies) {
        const decision = await policy.authorize(request)
        if (!decision.allowed) return decision
        for (const operation of decision.grant?.delegatedOperations ?? [])
          delegated.add(operation)
        for (const operation of decision.grant?.deniedOperations ?? [])
          denied.add(operation)
      }
      return {
        allowed: true,
        ...(delegated.size || denied.size
          ? {
              grant: {
                ...(delegated.size
                  ? { delegatedOperations: [...delegated] }
                  : {}),
                ...(denied.size ? { deniedOperations: [...denied] } : {}),
              },
            }
          : {}),
      }
    },
    // Preserve path-first short-circuiting for policies without the batch capability.
    ...(policies.every((policy) => typeof policy.authorizeMany === 'function')
      ? {
          authorizeMany: async (requests: readonly AccessRequest[]) => {
            const results: AccessDecision[] = requests.map(() => ({
              allowed: true,
            }))
            const delegated = requests.map(
              () =>
                new Set<
                  NonNullable<AccessGrant['delegatedOperations']>[number]
                >(),
            )
            const denied = requests.map(
              () =>
                new Set<NonNullable<AccessGrant['deniedOperations']>[number]>(),
            )
            for (const policy of policies) {
              const decisions = await authorizePolicyBatch(policy, requests)
              for (const [index, decision] of decisions.entries()) {
                if (!results[index].allowed) continue
                if (!decision.allowed) results[index] = decision
                else {
                  for (const operation of decision.grant?.delegatedOperations ??
                    [])
                    delegated[index].add(operation)
                  for (const operation of decision.grant?.deniedOperations ??
                    [])
                    denied[index].add(operation)
                }
              }
            }
            return results.map((decision, index) =>
              !decision.allowed
                ? decision
                : {
                    allowed: true as const,
                    ...(delegated[index].size || denied[index].size
                      ? {
                          grant: {
                            ...(delegated[index].size
                              ? { delegatedOperations: [...delegated[index]] }
                              : {}),
                            ...(denied[index].size
                              ? { deniedOperations: [...denied[index]] }
                              : {}),
                          },
                        }
                      : {}),
                  },
            )
          },
        }
      : {}),
    async discover(request) {
      let resources = [...request.resources]
      for (const policy of policies) {
        if (!policy.discover)
          throw new Error(
            'A plugin policy must implement discovery as well as authorization',
          )
        const decision = await policy.discover({ ...request, resources })
        if (decision.visibility === 'none') return decision
        if (decision.visibility === 'filtered') {
          const allowed = new Set(decision.resources.map(key))
          resources = resources.filter((resource) => allowed.has(key(resource)))
        }
      }
      return resources.length === request.resources.length
        ? { visibility: 'all' }
        : { visibility: 'filtered', resources }
    },
  }
}

const CORE_AUTH_MODELS = ['user', 'session', 'account', 'verification']
const HANDLER_METHODS = [
  'GET',
  'HEAD',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'OPTIONS',
]
// Core-owned URL prefixes. Handlers may not shadow them or the editor routes.
const RESERVED_HANDLER_PREFIXES = [
  ...CORE_ROOT_PATHS.filter((path) => path !== 'api').map((path) => `/${path}`),
  '/api/auth',
  '/api/plugins',
  '/api/app',
  '/api/health',
  '/api/session',
  '/api/dashboard',
  '/api/repositories',
  '/api/repository',
  '/api/branches',
  '/api/collections',
  '/api/entries',
  '/api/configuration',
  '/api/files',
  '/api/media',
  '/api/actions',
  '/api/activity',
  '/api/references',
  '/api/account',
  '/api/webhook',
  '/api/github-app',
  '/api/media-preview',
  '/_serverFn',
  '/assets',
]

function handlerPrefix(path: string) {
  return path.endsWith('/*') ? path.slice(0, -2) : path
}

function within(path: string, prefix: string) {
  return path === prefix || path.startsWith(`${prefix}/`)
}

export function handlerPathsOverlap(left: string, right: string) {
  const a = handlerPrefix(left)
  const b = handlerPrefix(right)
  if (a === b) return true
  return (
    (left.endsWith('/*') && within(b, a)) ||
    (right.endsWith('/*') && within(a, b))
  )
}

export function matchPluginHandler(
  handlers: readonly PluginHandler[],
  pathname: string,
) {
  return handlers.find((handler) =>
    handler.path.endsWith('/*')
      ? within(pathname, handlerPrefix(handler.path))
      : pathname === handler.path,
  )
}

function assertPluginHandler(pluginId: string, handler: PluginHandler) {
  const path = isRecord(handler) ? handler.path : undefined
  if (
    typeof path !== 'string' ||
    !/^(\/[A-Za-z0-9._~-]+)+(\/\*)?$/.test(path) ||
    path.split('/').some((segment) => segment === '.' || segment === '..') ||
    typeof handler.handle !== 'function' ||
    !Array.isArray(handler.methods) ||
    !handler.methods.length ||
    handler.methods.some((method) => !HANDLER_METHODS.includes(method))
  )
    throw new Error(`Invalid handler in plugin ${pluginId}`)
  const prefix = handlerPrefix(path)
  if (
    RESERVED_HANDLER_PREFIXES.some(
      (reserved) => within(prefix, reserved) || within(reserved, prefix),
    )
  )
    throw new Error(`Reserved handler path in plugin ${pluginId}: ${path}`)
  // Keep wildcard handlers below the dedicated HTTP namespaces.
  if (
    path.endsWith('/*') &&
    !prefix.startsWith('/api/') &&
    !prefix.startsWith('/.well-known/')
  )
    throw new Error(
      `Handler prefix must be below /api or /.well-known: ${path}`,
    )
  if (
    !path.endsWith('/*') &&
    prefix.split('/').length > 2 &&
    !prefix.startsWith('/api/') &&
    !prefix.startsWith('/.well-known/')
  )
    throw new Error(`Handler path would shadow an editor route: ${path}`)
}

export function composeServerPlugins(
  plugins: readonly ServerPlugin[],
  environment: unknown,
) {
  assertPluginIds(plugins)
  let emailProvider: ServerPluginServices['emailProvider']
  let mediaProviderResolver: ServerPluginServices['mediaProviderResolver']
  const policies: AccessPolicy[] = []
  const revokers: NonNullable<ServerPluginServices['revokeCredentials']>[] = []
  const guards: NonNullable<ServerPluginServices['beforeAccountDelete']>[] = []
  const pluginRoutes: Record<string, PluginRoute> = Object.create(null)
  const pluginHandlers: PluginHandler[] = []
  const authPlugins: NonNullable<PluginAuthExtension['plugins']>[number][] = []
  const authSchema: Record<string, object> = Object.create(null)
  for (const plugin of plugins) {
    const services = plugin.create(environment)
    if (!isRecord(services))
      throw new Error(`Plugin ${plugin.id} must return services`)
    for (const name of Object.keys(services))
      if (
        ![
          'emailProvider',
          'mediaProviderResolver',
          'policies',
          'routes',
          'handlers',
          'auth',
          'beforeAccountDelete',
          'revokeCredentials',
        ].includes(name)
      )
        throw new Error(`Unknown service ${name} in plugin ${plugin.id}`)
    if (
      services.emailProvider &&
      typeof services.emailProvider.send !== 'function'
    )
      throw new Error(`Invalid email provider in plugin ${plugin.id}`)
    if (
      services.mediaProviderResolver &&
      (typeof services.mediaProviderResolver.resolveStorage !== 'function' ||
        typeof services.mediaProviderResolver.resolveDelivery !== 'function')
    )
      throw new Error(`Invalid media resolver in plugin ${plugin.id}`)
    if (
      services.beforeAccountDelete &&
      typeof services.beforeAccountDelete !== 'function'
    )
      throw new Error(`Invalid deletion guard in plugin ${plugin.id}`)
    if (services.policies && !Array.isArray(services.policies))
      throw new Error(`Invalid policies in plugin ${plugin.id}`)
    if (services.routes && !Array.isArray(services.routes))
      throw new Error(`Invalid routes in plugin ${plugin.id}`)
    if (services.handlers && !Array.isArray(services.handlers))
      throw new Error(`Invalid handlers in plugin ${plugin.id}`)
    for (const handler of services.handlers ?? []) {
      assertPluginHandler(plugin.id, handler)
      for (const existing of pluginHandlers)
        if (handlerPathsOverlap(existing.path, handler.path))
          throw new Error(`Conflicting plugin handler path: ${handler.path}`)
      pluginHandlers.push(
        Object.freeze({
          ...handler,
          methods: Object.freeze([...handler.methods]),
        }),
      )
    }
    if (services.auth !== undefined) {
      if (
        !isRecord(services.auth) ||
        Object.keys(services.auth).some(
          (property) => !['plugins', 'schema'].includes(property),
        ) ||
        (services.auth.plugins !== undefined &&
          !Array.isArray(services.auth.plugins)) ||
        (services.auth.schema !== undefined && !isRecord(services.auth.schema))
      )
        throw new Error(`Invalid auth extension in plugin ${plugin.id}`)
      for (const authPlugin of services.auth.plugins ?? []) {
        if (!isRecord(authPlugin) || typeof authPlugin.id !== 'string')
          throw new Error(`Invalid auth plugin in plugin ${plugin.id}`)
        if (
          authPlugin.id === 'email-otp' ||
          authPlugins.some((existing) => existing.id === authPlugin.id)
        )
          throw new Error(`Duplicate auth plugin: ${authPlugin.id}`)
        authPlugins.push(authPlugin)
      }
      for (const [model, table] of Object.entries(services.auth.schema ?? {})) {
        if (
          CORE_AUTH_MODELS.includes(model) ||
          Object.hasOwn(authSchema, model)
        )
          throw new Error(`Conflicting auth model: ${model}`)
        if (!isRecord(table))
          throw new Error(`Invalid auth model ${model} in plugin ${plugin.id}`)
        authSchema[model] = table
      }
    }
    if (services.emailProvider) {
      if (emailProvider) throw new Error('Multiple email providers selected')
      emailProvider = services.emailProvider
    }
    if (services.mediaProviderResolver) {
      if (mediaProviderResolver)
        throw new Error('Multiple media resolvers selected')
      mediaProviderResolver = services.mediaProviderResolver
    }
    for (const policy of services.policies ?? []) {
      if (
        typeof policy.authorize !== 'function' ||
        typeof policy.discover !== 'function'
      )
        throw new Error(
          `Plugin ${plugin.id} must provide authorization and discovery together`,
        )
      if (
        policy.authorizeMany !== undefined &&
        typeof policy.authorizeMany !== 'function'
      )
        throw new Error(`Plugin ${plugin.id} has invalid batch authorization`)
      if (policy.reserve || policy.settle)
        throw new Error(
          'Plugin authorization policies cannot perform resource accounting',
        )
      policies.push(policy)
    }
    if (services.revokeCredentials !== undefined) {
      if (typeof services.revokeCredentials !== 'function')
        throw new Error(`Invalid credential revoker in plugin ${plugin.id}`)
      revokers.push(services.revokeCredentials)
    }
    if (services.beforeAccountDelete) guards.push(services.beforeAccountDelete)
    for (const route of services.routes ?? []) {
      if (
        !/^[a-z][a-z0-9-]*(\/[a-z][a-z0-9-]*)*$/.test(route.path) ||
        !['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(route.method) ||
        !['public', 'user', 'repository', 'manager'].includes(route.access) ||
        typeof route.handle !== 'function'
      )
        throw new Error(`Invalid route in plugin ${plugin.id}`)
      const routeKey = `${route.method} ${plugin.id}/${route.path}`
      if (Object.hasOwn(pluginRoutes, routeKey))
        throw new Error(`Duplicate plugin route: ${routeKey}`)
      pluginRoutes[routeKey] = Object.freeze({ ...route })
    }
  }
  return {
    emailProvider,
    mediaProviderResolver,
    accessPolicy: composePolicies(policies),
    pluginRoutes: Object.freeze(pluginRoutes),
    pluginHandlers: Object.freeze(pluginHandlers),
    authExtension: Object.freeze({
      plugins: Object.freeze(authPlugins),
      schema: Object.freeze(authSchema),
    }),
    ...(revokers.length
      ? {
          revokeCredentials: (userId: string | null) =>
            revokers.flatMap((revoke) => revoke(userId)),
        }
      : {}),
    beforeAccountDelete: guards.length
      ? async (input: { accountId: string }) => {
          for (const guard of guards) await guard(input)
        }
      : undefined,
  }
}
