import { pluginRegistry } from './discovery'
import { createServerPluginRegistry } from './server-registry.server'

import type { ServerPluginModule } from './server-contract.server'

const modules = import.meta.glob<ServerPluginModule>(
  '../../plugins/*/server.ts',
  { eager: true },
)
const manifestIds = new Set(pluginRegistry.plugins.map((plugin) => plugin.id))

export const serverPluginRegistry = createServerPluginRegistry(
  modules,
  manifestIds,
)
