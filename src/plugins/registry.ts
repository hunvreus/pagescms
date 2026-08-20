import { PLUGIN_API_VERSION } from './contract'

import type { PagesCmsPlugin, PluginModule } from './contract'

const pluginIdPattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/

export class PluginConfigurationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PluginConfigurationError'
  }
}

export interface PluginRegistry {
  readonly plugins: readonly PagesCmsPlugin[]
  get: (id: string) => PagesCmsPlugin | undefined
}

export function createPluginRegistry(
  modules: Readonly<Record<string, PluginModule>>,
): PluginRegistry {
  const plugins: PagesCmsPlugin[] = []
  const pluginsById = new Map<string, PagesCmsPlugin>()

  for (const [modulePath, module] of Object.entries(modules).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const plugin = parsePlugin(module.default, modulePath)

    if (pluginsById.has(plugin.id)) {
      throw new PluginConfigurationError(`Duplicate plugin id: ${plugin.id}`)
    }

    plugins.push(plugin)
    pluginsById.set(plugin.id, plugin)
  }

  return {
    plugins: Object.freeze(plugins),
    get: (id) => pluginsById.get(id),
  }
}

function parsePlugin(value: unknown, modulePath: string): PagesCmsPlugin {
  if (!isRecord(value)) {
    throw new PluginConfigurationError(
      `Plugin ${modulePath} must export a plugin definition as default`,
    )
  }

  if (value.apiVersion !== PLUGIN_API_VERSION) {
    throw new PluginConfigurationError(
      `Plugin ${modulePath} uses unsupported API version ${String(value.apiVersion)}`,
    )
  }

  if (typeof value.id !== 'string' || !pluginIdPattern.test(value.id)) {
    throw new PluginConfigurationError(
      `Plugin ${modulePath} has an invalid id; use lowercase kebab-case`,
    )
  }

  if (typeof value.name !== 'string' || value.name.trim().length === 0) {
    throw new PluginConfigurationError(`Plugin ${value.id} must have a name`)
  }

  return {
    apiVersion: PLUGIN_API_VERSION,
    id: value.id,
    name: value.name.trim(),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
