import type { PluginModule } from './contract'
import { createPluginRegistry } from './registry'

const modules = import.meta.glob<PluginModule>('../../plugins/*/plugin.ts', {
  eager: true,
})

export const pluginRegistry = createPluginRegistry(modules)
