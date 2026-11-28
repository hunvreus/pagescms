import { createConfigurationStore } from './configuration'
import type { ConfigurationStore } from './configuration'
import type { Database } from '#/server/db/client'

export function configurationStoreFor(
  access: {
    configurationStore?: ConfigurationStore
    waitUntil?: (promise: Promise<unknown>) => void
    readConfigurationFile?: Parameters<
      typeof createConfigurationStore
    >[0]['readFile']
  },
  database: Database,
) {
  return (
    access.configurationStore ??
    createConfigurationStore({
      database,
      waitUntil: access.waitUntil,
      readFile: access.readConfigurationFile,
    })
  )
}
