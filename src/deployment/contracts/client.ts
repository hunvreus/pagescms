import type { ComponentType } from 'react'
import type { JsonObject, JsonValue } from '#/lib/json'
import type {
  RepositoryRole,
  RepositoryRoleAssignment,
  RepositoryPermissions,
} from './hosted.server'

import { DEPLOYMENT_API_VERSION, DeploymentConfigurationError } from './version'

export interface DeploymentFieldProps {
  field: JsonObject
  id?: string
  label?: string
  value: JsonValue | undefined
  disabled: boolean
  required: boolean
  onChange: (value: JsonValue | undefined) => void
}

export type LazyClientContribution<TProps> = () => Promise<{
  default: ComponentType<TProps>
}>

export interface RepositoryPermissionsContributionProps {
  branch: string
  disabled: boolean
  owner: string
  repo: string
  collaborators: readonly Readonly<{
    id: number
    email: string
    userId: string | null
    branch: string | null
  }>[]
  branches: readonly string[]
  onInvite: (input: {
    emails: string[]
    expectedVersion: string
    roles: readonly string[]
    branches: 'all' | readonly string[]
  }) => Promise<void>
  onRemove: (id: number) => Promise<void>
  resources: readonly Readonly<{
    type: 'collection' | 'media' | 'action'
    name: string
  }>[]
  snapshot: RepositoryPermissions
  onReplace: (input: {
    expectedVersion: string
    roles: readonly RepositoryRole[]
    assignments: readonly RepositoryRoleAssignment[]
  }) => Promise<RepositoryPermissions>
}

export interface PagesCmsClientDeployment {
  apiVersion: typeof DEPLOYMENT_API_VERSION
  fieldEditors?: Readonly<
    Record<string, LazyClientContribution<DeploymentFieldProps>>
  >
  ui?: Readonly<{
    repositoryPermissions?: LazyClientContribution<RepositoryPermissionsContributionProps>
  }>
}

interface PagesCmsClientDeploymentInput {
  apiVersion: number
  fieldEditors?: Readonly<
    Record<string, LazyClientContribution<DeploymentFieldProps>>
  >
  ui?: Readonly<{
    repositoryPermissions?: LazyClientContribution<RepositoryPermissionsContributionProps>
  }>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assertOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
) {
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key))
  if (unexpected.length > 0) {
    throw new DeploymentConfigurationError(
      `${label} has unsupported ${unexpected.length === 1 ? 'key' : 'keys'}: ${unexpected.join(', ')}`,
    )
  }
}

export function definePagesCmsClientDeployment(
  deployment: PagesCmsClientDeploymentInput,
): PagesCmsClientDeployment {
  if (!isRecord(deployment)) {
    throw new DeploymentConfigurationError(
      'The client deployment must export an object',
    )
  }
  assertOnlyKeys(
    deployment,
    ['apiVersion', 'fieldEditors', 'ui'],
    'The client deployment',
  )
  if (deployment.apiVersion !== DEPLOYMENT_API_VERSION) {
    throw new DeploymentConfigurationError(
      `The client deployment uses unsupported API version ${String(deployment.apiVersion)}`,
    )
  }
  if (
    deployment.fieldEditors !== undefined &&
    !isRecord(deployment.fieldEditors)
  ) {
    throw new DeploymentConfigurationError(
      'The client deployment field editors must be an object',
    )
  }

  for (const [name, loader] of Object.entries(deployment.fieldEditors ?? {})) {
    if (!/^[a-zA-Z0-9-_]+$/.test(name) || typeof loader !== 'function') {
      throw new DeploymentConfigurationError(
        `The client deployment has an invalid field ${name}`,
      )
    }
  }
  if (deployment.ui !== undefined && !isRecord(deployment.ui)) {
    throw new DeploymentConfigurationError(
      'The client deployment UI contributions must be an object',
    )
  }
  if (deployment.ui) {
    assertOnlyKeys(
      deployment.ui,
      ['repositoryPermissions'],
      'The client deployment UI contributions',
    )
  }
  if (
    deployment.ui?.repositoryPermissions !== undefined &&
    typeof deployment.ui.repositoryPermissions !== 'function'
  ) {
    throw new DeploymentConfigurationError(
      'The repository permissions contribution must be lazy',
    )
  }

  return Object.freeze({
    apiVersion: DEPLOYMENT_API_VERSION,
    fieldEditors: Object.freeze({ ...deployment.fieldEditors }),
    ui: Object.freeze({ ...deployment.ui }),
  })
}
