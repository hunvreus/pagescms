import type { AccessPolicy } from '#/server/access-policy.server'
import type { EmailProvider } from '#/server/email.server'
import { PLUGIN_API_VERSION } from './contract'

import type {
  EmailProviderFactory,
  PagesCmsServerPlugin,
  ServerPluginModule,
} from './server-contract.server'

export class ServerPluginConfigurationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ServerPluginConfigurationError'
  }
}

export interface ServerPluginRegistry {
  readonly contributions: readonly PagesCmsServerPlugin[]
  readonly accessPolicy?: AccessPolicy
  readonly createEmailProvider?: EmailProviderFactory
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isAccessPolicy(value: unknown): value is AccessPolicy {
  return (
    isRecord(value) &&
    typeof value.authorize === 'function' &&
    (value.reserve === undefined || typeof value.reserve === 'function') &&
    (value.settle === undefined || typeof value.settle === 'function')
  )
}

function isEmailProvider(value: unknown): value is EmailProvider {
  return isRecord(value) && typeof value.send === 'function'
}

function parseServerPlugin(
  value: unknown,
  modulePath: string,
  manifestIds: ReadonlySet<string>,
): PagesCmsServerPlugin {
  if (!isRecord(value)) {
    throw new ServerPluginConfigurationError(
      `Server plugin ${modulePath} must export a contribution as default`,
    )
  }
  if (value.apiVersion !== PLUGIN_API_VERSION) {
    throw new ServerPluginConfigurationError(
      `Server plugin ${modulePath} uses unsupported API version ${String(value.apiVersion)}`,
    )
  }
  if (typeof value.pluginId !== 'string' || !manifestIds.has(value.pluginId)) {
    throw new ServerPluginConfigurationError(
      `Server plugin ${modulePath} requires a matching plugin manifest`,
    )
  }
  if (value.accessPolicy !== undefined && !isAccessPolicy(value.accessPolicy)) {
    throw new ServerPluginConfigurationError(
      `Server plugin ${value.pluginId} has an invalid access policy`,
    )
  }
  if (
    value.createEmailProvider !== undefined &&
    typeof value.createEmailProvider !== 'function'
  ) {
    throw new ServerPluginConfigurationError(
      `Server plugin ${value.pluginId} has an invalid email provider factory`,
    )
  }

  return {
    apiVersion: PLUGIN_API_VERSION,
    pluginId: value.pluginId,
    accessPolicy: value.accessPolicy,
    createEmailProvider: value.createEmailProvider as
      EmailProviderFactory | undefined,
  }
}

export function createServerPluginRegistry(
  modules: Readonly<Record<string, ServerPluginModule>>,
  manifestIds: ReadonlySet<string>,
): ServerPluginRegistry {
  const contributions = Object.entries(modules)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([modulePath, module]) =>
      parseServerPlugin(module.default, modulePath, manifestIds),
    )
  const accessPolicies = contributions.flatMap((contribution) =>
    contribution.accessPolicy ? [contribution.accessPolicy] : [],
  )
  const emailProviderFactories = contributions.flatMap((contribution) =>
    contribution.createEmailProvider ? [contribution.createEmailProvider] : [],
  )

  if (accessPolicies.length > 1) {
    throw new ServerPluginConfigurationError(
      'Multiple access-policy providers are configured',
    )
  }
  if (emailProviderFactories.length > 1) {
    throw new ServerPluginConfigurationError(
      'Multiple email providers are configured',
    )
  }
  const emailProviderFactory = emailProviderFactories.at(0)

  return {
    contributions: Object.freeze(contributions),
    accessPolicy: accessPolicies[0],
    createEmailProvider: emailProviderFactory
      ? (environment) => {
          const provider: unknown = emailProviderFactory(environment)
          if (provider !== undefined && !isEmailProvider(provider)) {
            throw new ServerPluginConfigurationError(
              'Email provider factory returned an invalid provider',
            )
          }
          return provider
        }
      : undefined,
  }
}
