import type { DatabaseStatement } from '#/server/db/core'
import type { AccessPolicy, AccessPrincipal } from '#/server/access/policy'
import type { EmailProvider } from '#/server/email/email'
import type { MediaProviderResolver } from '#/server/media/provider'
import type { RequestServices } from '#/server/context'
import type { RepositoryRef } from '#/lib/repository'
import type { RepositoryUser } from '#/server/repository/repositories'

export type PluginRequestServices = Pick<
  RequestServices,
  | 'database'
  | 'cacheDatabase'
  | 'access'
  | 'auth'
  | 'repositoryAccess'
  | 'emailProvider'
  | 'configuration'
  | 'githubApiFactory'
  | 'mediaProviderResolver'
  | 'repositories'
  | 'getSession'
>

export interface PluginRequestContext {
  services: PluginRequestServices
  user: (RepositoryUser & { name: string; image?: string | null }) | null
  repository: (RepositoryRef & { branch: string }) | null
  repositoryIdentity?: Exclude<
    AccessPrincipal,
    { type: 'anonymous' }
  >['repositoryIdentity']
}

export interface PluginRoute {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  path: string
  access: 'public' | 'user' | 'repository' | 'manager'
  handle: (request: Request, context: PluginRequestContext) => Promise<Response>
}

export type PluginHandlerMethod =
  'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS'

export interface PluginHandlerContext {
  services: PluginRequestServices
  /** Request ID echoed in the `x-request-id` response header. */
  requestId: string
}

/**
 * A request handler mounted at an absolute path outside `/api/plugins`.
 * Core performs no authentication, CSRF or origin checks: the handler owns them.
 * `path` matches exactly; a trailing `/*` also matches every descendant path.
 */
export interface PluginHandler {
  path: string
  methods: readonly PluginHandlerMethod[]
  handle: (request: Request, context: PluginHandlerContext) => Promise<Response>
}

/**
 * A Better Auth plugin object. Typed structurally so deployment plugins do not
 * depend on the core's copy of Better Auth types; the application build
 * dedupes the Better Auth runtime so both refer to one implementation.
 */
export interface AuthPluginContribution {
  id: string
}

/** Better Auth plugins and Drizzle tables added to the core auth instance. */
export interface PluginAuthExtension {
  plugins?: readonly AuthPluginContribution[]
  /** Drizzle tables keyed by Better Auth model name. Core models cannot be replaced. */
  schema?: Readonly<Record<string, object>>
}

export interface ServerPluginServices {
  emailProvider?: EmailProvider
  mediaProviderResolver?: MediaProviderResolver
  policies?: readonly AccessPolicy[]
  routes?: readonly PluginRoute[]
  handlers?: readonly PluginHandler[]
  auth?: PluginAuthExtension
  /** Statements executed atomically with an administrator's session revocation. */
  revokeCredentials?: (userId: string | null) => readonly DatabaseStatement[]
  beforeAccountDelete?: (input: { accountId: string }) => Promise<void>
}

export interface ServerPlugin {
  id: string
  create: (environment: unknown) => ServerPluginServices
}

// Background plugin tasks must recheck the same admission as HTTP routes.
export {
  requireRepositoryManager,
  resolveRepositoryPrincipal,
} from '#/server/access/repository-policy'
