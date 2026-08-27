import type { AccessPolicy } from '#/server/access-policy.server'
import type { EmailProvider } from '#/server/email.server'

import type { PLUGIN_API_VERSION } from './contract'

export type EmailProviderFactory = (
  environment: unknown,
) => EmailProvider | undefined

export interface PagesCmsServerPlugin {
  apiVersion: typeof PLUGIN_API_VERSION
  pluginId: string
  accessPolicy?: AccessPolicy
  createEmailProvider?: EmailProviderFactory
}

export interface ServerPluginModule {
  default: unknown
}

export function defineServerPlugin(
  contribution: PagesCmsServerPlugin,
): PagesCmsServerPlugin {
  return contribution
}
