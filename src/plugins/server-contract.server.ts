import type { AccessPolicy } from '#/server/access-policy.server'

import type { PLUGIN_API_VERSION } from './contract'

export interface PagesCmsServerPlugin {
  apiVersion: typeof PLUGIN_API_VERSION
  pluginId: string
  accessPolicy?: AccessPolicy
}

export interface ServerPluginModule {
  default: unknown
}

export function defineServerPlugin(
  contribution: PagesCmsServerPlugin,
): PagesCmsServerPlugin {
  return contribution
}
