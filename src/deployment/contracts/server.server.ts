import { composeServerPlugins } from '#/plugins/compose.server'
import { assertPluginIds, isRecord } from '#/plugins/identity'
import { DEPLOYMENT_API_VERSION, DeploymentConfigurationError } from './version'
import type { ServerPlugin } from '#/plugins/server'

export type {
  EmailAddress,
  EmailMessage,
  EmailProvider,
} from '#/server/email/email'
export type {
  ServerPlugin,
  ServerPluginServices,
  PluginRoute,
  PluginRequestContext,
} from '#/plugins/server'
export type PagesCmsServerServices = ReturnType<typeof composeServerPlugins>
export interface PagesCmsServerDeployment {
  apiVersion: typeof DEPLOYMENT_API_VERSION
  plugins: readonly ServerPlugin[]
}

export function definePagesCmsServerDeployment(input: {
  apiVersion: number
  plugins?: readonly ServerPlugin[]
}): PagesCmsServerDeployment {
  if (!isRecord(input) || input.apiVersion !== DEPLOYMENT_API_VERSION)
    throw new DeploymentConfigurationError(
      'Unsupported server deployment API version',
    )
  if (
    Object.keys(input).some((key) => !['apiVersion', 'plugins'].includes(key))
  )
    throw new DeploymentConfigurationError('Unsupported server deployment key')
  const plugins = input.plugins ?? []
  if (!Array.isArray(plugins))
    throw new DeploymentConfigurationError('Plugins must be an array')
  assertPluginIds(plugins)
  for (const plugin of plugins)
    if (typeof plugin.create !== 'function')
      throw new DeploymentConfigurationError(
        `Plugin ${plugin.id} must provide a factory`,
      )
  return Object.freeze({
    apiVersion: DEPLOYMENT_API_VERSION,
    plugins: Object.freeze([...plugins]),
  })
}

export function createPagesCmsServerServices(
  deployment: PagesCmsServerDeployment,
  environment: unknown,
): PagesCmsServerServices {
  return Object.freeze(composeServerPlugins(deployment.plugins, environment))
}
