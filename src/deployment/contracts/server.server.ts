import type { AccessPolicy } from '#/server/access-policy.server'
import type { EmailProvider } from '#/server/email.server'

import { DEPLOYMENT_API_VERSION, DeploymentConfigurationError } from './version'

export interface PagesCmsServerServices {
  accessPolicy?: AccessPolicy
  emailProvider?: EmailProvider
}

export interface PagesCmsServerDeployment {
  apiVersion: typeof DEPLOYMENT_API_VERSION
  create: (environment: unknown) => PagesCmsServerServices
}

interface PagesCmsServerDeploymentInput {
  apiVersion: number
  create: (environment: unknown) => PagesCmsServerServices
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isAccessPolicy(value: unknown): value is AccessPolicy {
  return (
    isRecord(value) &&
    typeof value.authorize === 'function' &&
    (value.reserve === undefined || typeof value.reserve === 'function') &&
    (value.settle === undefined || typeof value.settle === 'function')
  )
}

function isEmailProvider(value: unknown): value is EmailProvider {
  return isRecord(value) && typeof value.send === 'function'
}

export function definePagesCmsServerDeployment(
  deployment: PagesCmsServerDeploymentInput,
): PagesCmsServerDeployment {
  if (!isRecord(deployment)) {
    throw new DeploymentConfigurationError(
      'The server deployment must export an object',
    )
  }
  if (deployment.apiVersion !== DEPLOYMENT_API_VERSION) {
    throw new DeploymentConfigurationError(
      `The server deployment uses unsupported API version ${String(deployment.apiVersion)}`,
    )
  }
  if (typeof deployment.create !== 'function') {
    throw new DeploymentConfigurationError(
      'The server deployment must provide a create factory',
    )
  }
  return Object.freeze({
    apiVersion: DEPLOYMENT_API_VERSION,
    create: deployment.create,
  })
}

export function createPagesCmsServerServices(
  deployment: PagesCmsServerDeployment,
  environment: unknown,
): PagesCmsServerServices {
  const services: unknown = deployment.create(environment)
  if (!isRecord(services)) {
    throw new DeploymentConfigurationError(
      'The server deployment factory must return an object',
    )
  }
  if (
    services.accessPolicy !== undefined &&
    !isAccessPolicy(services.accessPolicy)
  ) {
    throw new DeploymentConfigurationError(
      'The server deployment returned an invalid access policy',
    )
  }
  if (
    services.emailProvider !== undefined &&
    !isEmailProvider(services.emailProvider)
  ) {
    throw new DeploymentConfigurationError(
      'The server deployment returned an invalid email provider',
    )
  }

  return Object.freeze({
    accessPolicy: services.accessPolicy,
    emailProvider: services.emailProvider,
  })
}
