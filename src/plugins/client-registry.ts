import { PLUGIN_API_VERSION } from './contract'

import type {
  ClientPluginModule,
  PagesCmsClientPlugin,
  PluginFieldComponent,
} from './client-contract'

export class ClientPluginConfigurationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ClientPluginConfigurationError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function createClientPluginRegistry(
  modules: Readonly<Record<string, ClientPluginModule>>,
  manifestIds: ReadonlySet<string>,
) {
  const contributions: PagesCmsClientPlugin[] = []
  const fields = new Map<string, PluginFieldComponent>()

  for (const [modulePath, module] of Object.entries(modules).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const value = module.default
    if (!isRecord(value) || value.apiVersion !== PLUGIN_API_VERSION) {
      throw new ClientPluginConfigurationError(
        `Client plugin ${modulePath} uses an unsupported API version`,
      )
    }
    if (
      typeof value.pluginId !== 'string' ||
      !manifestIds.has(value.pluginId)
    ) {
      throw new ClientPluginConfigurationError(
        `Client plugin ${modulePath} requires a matching plugin manifest`,
      )
    }
    if (value.fields !== undefined && !isRecord(value.fields)) {
      throw new ClientPluginConfigurationError(
        `Client plugin ${value.pluginId} has invalid fields`,
      )
    }
    const contributionFields: Record<string, PluginFieldComponent> = {}
    for (const [name, component] of Object.entries(value.fields ?? {})) {
      if (!/^[a-zA-Z0-9-_]+$/.test(name) || typeof component !== 'function') {
        throw new ClientPluginConfigurationError(
          `Client plugin ${value.pluginId} has an invalid field ${name}`,
        )
      }
      if (fields.has(name)) {
        throw new ClientPluginConfigurationError(
          `Multiple plugins register field component ${name}`,
        )
      }
      const fieldComponent = component as PluginFieldComponent
      fields.set(name, fieldComponent)
      contributionFields[name] = fieldComponent
    }
    contributions.push({
      apiVersion: PLUGIN_API_VERSION,
      pluginId: value.pluginId,
      fields: contributionFields,
    })
  }

  return {
    contributions: Object.freeze(contributions),
    getField(name: string) {
      return fields.get(name)
    },
  }
}
