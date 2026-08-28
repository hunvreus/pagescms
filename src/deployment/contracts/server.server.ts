import type { AccessPolicy } from '#/server/access-policy.server'
import type { EmailProvider } from '#/server/email.server'
import type { MediaProviderResolver } from '#/server/media-provider.server'
import type {
  BillingWebhookHandler,
  EntitlementReader,
  RepositoryPermissionAdmin,
} from './hosted.server'

import { DEPLOYMENT_API_VERSION, DeploymentConfigurationError } from './version'

export interface PagesCmsServerServices {
  accessPolicy?: AccessPolicy
  billingWebhook?: BillingWebhookHandler
  emailProvider?: EmailProvider
  entitlementReader?: EntitlementReader
  mediaProviderResolver?: MediaProviderResolver
  repositoryPermissionAdmin?: RepositoryPermissionAdmin
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

function hasFunction(value: unknown, key: string) {
  return isRecord(value) && typeof value[key] === 'function'
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

function isMediaProviderResolver(
  value: unknown,
): value is MediaProviderResolver {
  return (
    isRecord(value) &&
    typeof value.resolveStorage === 'function' &&
    typeof value.resolveDelivery === 'function'
  )
}

export function definePagesCmsServerDeployment(
  deployment: PagesCmsServerDeploymentInput,
): PagesCmsServerDeployment {
  if (!isRecord(deployment)) {
    throw new DeploymentConfigurationError(
      'The server deployment must export an object',
    )
  }
  assertOnlyKeys(deployment, ['apiVersion', 'create'], 'The server deployment')
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
  assertOnlyKeys(
    services,
    [
      'accessPolicy',
      'billingWebhook',
      'emailProvider',
      'entitlementReader',
      'mediaProviderResolver',
      'repositoryPermissionAdmin',
    ],
    'The server deployment services',
  )
  if (
    services.accessPolicy !== undefined &&
    !isAccessPolicy(services.accessPolicy)
  ) {
    throw new DeploymentConfigurationError(
      'The server deployment returned an invalid access policy',
    )
  }
  if (
    services.billingWebhook !== undefined &&
    !hasFunction(services.billingWebhook, 'handle')
  ) {
    throw new DeploymentConfigurationError(
      'The server deployment returned an invalid billing webhook handler',
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
  if (
    services.entitlementReader !== undefined &&
    !hasFunction(services.entitlementReader, 'read')
  ) {
    throw new DeploymentConfigurationError(
      'The server deployment returned an invalid entitlement reader',
    )
  }
  if (
    services.mediaProviderResolver !== undefined &&
    !isMediaProviderResolver(services.mediaProviderResolver)
  ) {
    throw new DeploymentConfigurationError(
      'The server deployment returned an invalid media provider resolver',
    )
  }
  if (
    services.repositoryPermissionAdmin !== undefined &&
    (!hasFunction(services.repositoryPermissionAdmin, 'read') ||
      !hasFunction(services.repositoryPermissionAdmin, 'replace'))
  ) {
    throw new DeploymentConfigurationError(
      'The server deployment returned an invalid repository permission admin',
    )
  }

  return Object.freeze({
    accessPolicy: services.accessPolicy,
    billingWebhook: services.billingWebhook as
      BillingWebhookHandler | undefined,
    emailProvider: services.emailProvider,
    entitlementReader: services.entitlementReader as
      EntitlementReader | undefined,
    mediaProviderResolver: services.mediaProviderResolver,
    repositoryPermissionAdmin: services.repositoryPermissionAdmin as
      RepositoryPermissionAdmin | undefined,
  })
}
