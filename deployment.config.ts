import { dirname, isAbsolute, resolve } from 'node:path'

export const SERVER_DEPLOYMENT_ALIAS = '#pagescms/deployment/server'
export const CLIENT_DEPLOYMENT_ALIAS = '#pagescms/deployment/client'

export interface DeploymentEntries {
  client: string
  server: string
  selected: boolean
  allowedDirectories: readonly string[]
}

export interface ApplicationAlias {
  find: string | RegExp
  replacement: string
}

interface DeploymentSelectorEnvironment {
  PAGESCMS_DEPLOYMENT_CLIENT?: string
  PAGESCMS_DEPLOYMENT_SERVER?: string
}

function entryPath(rootDirectory: string, value: string) {
  return isAbsolute(value) ? value : resolve(rootDirectory, value)
}

export function resolveDeploymentEntries(
  environment: DeploymentSelectorEnvironment,
  rootDirectory: string,
): DeploymentEntries {
  const selectedServer = environment.PAGESCMS_DEPLOYMENT_SERVER?.trim()
  const selectedClient = environment.PAGESCMS_DEPLOYMENT_CLIENT?.trim()

  if (Boolean(selectedServer) !== Boolean(selectedClient)) {
    throw new Error(
      'PAGESCMS_DEPLOYMENT_SERVER and PAGESCMS_DEPLOYMENT_CLIENT must be configured together',
    )
  }

  const server = entryPath(
    rootDirectory,
    selectedServer ?? 'src/deployment/default/server.server.ts',
  )
  const client = entryPath(
    rootDirectory,
    selectedClient ?? 'src/deployment/default/client.ts',
  )

  return {
    client,
    server,
    selected: Boolean(selectedServer),
    allowedDirectories: Object.freeze([
      ...new Set([dirname(client), dirname(server)]),
    ]),
  }
}

export function resolveApplicationAliases(
  entries: DeploymentEntries,
  rootDirectory: string,
): readonly ApplicationAlias[] {
  const sourceDirectory = `${resolve(rootDirectory, 'src')}/`

  return Object.freeze([
    { find: SERVER_DEPLOYMENT_ALIAS, replacement: entries.server },
    { find: CLIENT_DEPLOYMENT_ALIAS, replacement: entries.client },
    { find: /^#\//, replacement: sourceDirectory },
    { find: /^@\//, replacement: sourceDirectory },
  ])
}
