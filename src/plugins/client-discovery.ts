import { pluginRegistry } from './discovery'
import { createClientPluginRegistry } from './client-registry'

import type { ClientPluginModule } from './client-contract'

const modules = import.meta.glob<ClientPluginModule>(
  '../../plugins/*/client.ts',
  { eager: true },
)
const manifestIds = new Set(pluginRegistry.plugins.map((plugin) => plugin.id))

export const clientPluginRegistry = createClientPluginRegistry(
  modules,
  manifestIds,
)
