import { createResendEmailProvider } from '#/deployment/builtins/resend-email.server'
import { isRecord } from '#/plugins/identity'
import { DEFAULT_EMAIL_PLUGIN_ID } from './constants'
import type { JsonObject } from '#/shared/json'
import type { PackageTarget } from './config'
import type { ServerPlugin } from '#/plugins/server'

// Helpers imported by generated server entries; core composition stays unchanged.

export interface ServerPluginContext {
  publicOptions: JsonObject
  target: PackageTarget
}

export type ServerPluginModule = (
  options: JsonObject,
  context: ServerPluginContext,
) => ServerPlugin

export function instantiateServerPlugin(
  id: string,
  factory: unknown,
  options: JsonObject,
  context: ServerPluginContext,
): ServerPlugin {
  if (typeof factory !== 'function')
    throw new Error(`Plugin ${id} server module must export a default factory`)
  const plugin: unknown = factory(options, context)
  if (!isRecord(plugin) || (plugin as ServerPlugin).id !== id)
    throw new Error(`Plugin ${id} server factory must return plugin ${id}`)
  return plugin as ServerPlugin
}

// Appends Resend as a fallback used only when no registered plugin returned an
// email provider. composeServerPlugins calls create synchronously in array order,
// so the fallback observes every earlier plugin of the same composition.
export function withDefaultEmail(
  plugins: readonly ServerPlugin[],
  createFallback: (
    environment: unknown,
  ) => ReturnType<typeof createResendEmailProvider> = createResendEmailProvider,
): ServerPlugin[] {
  let supplied = false
  const wrapped = plugins.map((plugin, index): ServerPlugin => ({
    ...plugin,
    create: (environment) => {
      if (index === 0) supplied = false
      const services = plugin.create(environment)
      if (isRecord(services) && services.emailProvider) supplied = true
      return services
    },
  }))
  return [
    ...wrapped,
    {
      id: DEFAULT_EMAIL_PLUGIN_ID,
      create: (environment) => {
        const explicit = supplied
        supplied = false
        if (explicit) return {}
        const emailProvider = createFallback(environment)
        return emailProvider ? { emailProvider } : {}
      },
    },
  ]
}
