import type { JsonObject, JsonValue } from '#/lib/json'

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

export type DeploymentFieldComponent = (
  props: DeploymentFieldProps,
) => React.ReactNode

export interface PagesCmsClientDeployment {
  apiVersion: typeof DEPLOYMENT_API_VERSION
  fields?: Readonly<Record<string, DeploymentFieldComponent>>
}

interface PagesCmsClientDeploymentInput {
  apiVersion: number
  fields?: Readonly<Record<string, DeploymentFieldComponent>>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function definePagesCmsClientDeployment(
  deployment: PagesCmsClientDeploymentInput,
): PagesCmsClientDeployment {
  if (!isRecord(deployment)) {
    throw new DeploymentConfigurationError(
      'The client deployment must export an object',
    )
  }
  if (deployment.apiVersion !== DEPLOYMENT_API_VERSION) {
    throw new DeploymentConfigurationError(
      `The client deployment uses unsupported API version ${String(deployment.apiVersion)}`,
    )
  }
  if (deployment.fields !== undefined && !isRecord(deployment.fields)) {
    throw new DeploymentConfigurationError(
      'The client deployment fields must be an object',
    )
  }

  for (const [name, component] of Object.entries(deployment.fields ?? {})) {
    if (!/^[a-zA-Z0-9-_]+$/.test(name) || typeof component !== 'function') {
      throw new DeploymentConfigurationError(
        `The client deployment has an invalid field ${name}`,
      )
    }
  }

  return Object.freeze({
    apiVersion: DEPLOYMENT_API_VERSION,
    fields: Object.freeze({ ...deployment.fields }) as Readonly<
      Record<string, DeploymentFieldComponent>
    >,
  })
}
