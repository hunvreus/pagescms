export const PLUGIN_API_VERSION = 1 as const

export interface PagesCmsPlugin {
  apiVersion: typeof PLUGIN_API_VERSION
  id: string
  name: string
}

export interface PluginModule {
  default: unknown
}

export function definePlugin(plugin: PagesCmsPlugin): PagesCmsPlugin {
  return plugin
}
