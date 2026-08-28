import type {
  AccessPrincipal,
  AccessTenant,
} from '#/server/access-policy.server'
import { APPLICATION_OPERATIONS } from '#/lib/application-operations'
import type { ApplicationOperation } from '#/lib/application-operations'

import { DeploymentConfigurationError } from './version'

export type EntitlementStatus =
  | 'free'
  | 'trialing'
  | 'active'
  | 'grace_period'
  | 'past_due'
  | 'canceled'
  | 'suspended'

export interface EntitlementUsageCounter {
  key: string
  label: string
  used: number
  limit: number | null
}

export interface EntitlementSnapshot {
  policyVersion: string
  status: EntitlementStatus
  planLabel: string
  usage: readonly EntitlementUsageCounter[]
  upgradeUrl?: string
  billingPortalUrl?: string
}

export interface EntitlementReader {
  read: (request: {
    principal: AccessPrincipal
    tenant: AccessTenant
  }) => Promise<EntitlementSnapshot | null>
}

export interface BillingWebhookHandler {
  handle: (request: { body: Uint8Array; headers: Headers }) => Promise<{
    status?: 200 | 202 | 204
    eventId?: string
  } | void>
}

export class BillingWebhookRequestError extends Error {
  readonly status: 400 | 401

  constructor(status: 400 | 401, message = 'Invalid billing webhook') {
    super(message)
    this.name = 'BillingWebhookRequestError'
    this.status = status
  }
}

export type RepositoryPermissionResource =
  | Readonly<{ type: 'repository' }>
  | Readonly<{ type: 'collection' | 'media' | 'action'; name: string }>

export interface RepositoryPermissionGrant {
  id: string
  principalId: string
  principalType: 'user' | 'collaborator'
  operations: readonly ApplicationOperation[]
  resource: RepositoryPermissionResource
}

export interface RepositoryPermissionSnapshot {
  version: string
  grants: readonly RepositoryPermissionGrant[]
}

export interface RepositoryPermissionAdmin {
  read: (repository: {
    owner: string
    repo: string
  }) => Promise<RepositoryPermissionSnapshot>
  replace: (input: {
    owner: string
    repo: string
    expectedVersion: string
    grants: readonly RepositoryPermissionGrant[]
    actorId: string
  }) => Promise<RepositoryPermissionSnapshot>
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

function requiredString(value: unknown, label: string) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 200) {
    throw new DeploymentConfigurationError(`${label} must be a string`)
  }
  return value
}

function safeUrl(value: unknown, label: string) {
  if (value === undefined) return undefined
  const source = requiredString(value, label)
  let url: URL
  try {
    url = new URL(source)
  } catch {
    throw new DeploymentConfigurationError(`${label} must be an HTTP URL`)
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new DeploymentConfigurationError(`${label} must be an HTTP URL`)
  }
  return url.toString()
}

const entitlementStatuses = new Set<EntitlementStatus>([
  'free',
  'trialing',
  'active',
  'grace_period',
  'past_due',
  'canceled',
  'suspended',
])

export function validateEntitlementSnapshot(
  value: unknown,
): EntitlementSnapshot {
  if (!isRecord(value)) {
    throw new DeploymentConfigurationError(
      'The entitlement reader returned an invalid snapshot',
    )
  }
  assertOnlyKeys(
    value,
    [
      'policyVersion',
      'status',
      'planLabel',
      'usage',
      'upgradeUrl',
      'billingPortalUrl',
    ],
    'The entitlement snapshot',
  )
  if (!entitlementStatuses.has(value.status as EntitlementStatus)) {
    throw new DeploymentConfigurationError(
      'The entitlement snapshot has an invalid status',
    )
  }
  if (!Array.isArray(value.usage) || value.usage.length > 100) {
    throw new DeploymentConfigurationError(
      'The entitlement snapshot has invalid usage counters',
    )
  }
  const usage = value.usage.map((counter, index) => {
    if (!isRecord(counter)) {
      throw new DeploymentConfigurationError(
        `Entitlement usage counter ${index} is invalid`,
      )
    }
    assertOnlyKeys(
      counter,
      ['key', 'label', 'used', 'limit'],
      `Entitlement usage counter ${index}`,
    )
    if (
      typeof counter.used !== 'number' ||
      !Number.isFinite(counter.used) ||
      counter.used < 0 ||
      (counter.limit !== null &&
        (typeof counter.limit !== 'number' ||
          !Number.isFinite(counter.limit) ||
          counter.limit < 0))
    ) {
      throw new DeploymentConfigurationError(
        `Entitlement usage counter ${index} has invalid values`,
      )
    }
    return Object.freeze({
      key: requiredString(
        counter.key,
        `Entitlement usage counter ${index} key`,
      ),
      label: requiredString(
        counter.label,
        `Entitlement usage counter ${index} label`,
      ),
      used: counter.used,
      limit: counter.limit,
    })
  })

  return Object.freeze({
    policyVersion: requiredString(
      value.policyVersion,
      'The entitlement policy version',
    ),
    status: value.status as EntitlementStatus,
    planLabel: requiredString(value.planLabel, 'The entitlement plan label'),
    usage: Object.freeze(usage),
    ...(safeUrl(value.upgradeUrl, 'The entitlement upgrade URL')
      ? { upgradeUrl: safeUrl(value.upgradeUrl, 'The entitlement upgrade URL') }
      : {}),
    ...(safeUrl(value.billingPortalUrl, 'The billing portal URL')
      ? {
          billingPortalUrl: safeUrl(
            value.billingPortalUrl,
            'The billing portal URL',
          ),
        }
      : {}),
  })
}

const operations = new Set<string>(APPLICATION_OPERATIONS)

export function validateRepositoryPermissionSnapshot(
  value: unknown,
): RepositoryPermissionSnapshot {
  if (!isRecord(value)) {
    throw new DeploymentConfigurationError(
      'The repository permission admin returned an invalid snapshot',
    )
  }
  assertOnlyKeys(value, ['version', 'grants'], 'The permission snapshot')
  if (!Array.isArray(value.grants) || value.grants.length > 10_000) {
    throw new DeploymentConfigurationError(
      'The permission snapshot has invalid grants',
    )
  }
  const grants = value.grants.map((grant, index) => {
    if (!isRecord(grant) || !isRecord(grant.resource)) {
      throw new DeploymentConfigurationError(
        `Repository permission grant ${index} is invalid`,
      )
    }
    assertOnlyKeys(
      grant,
      ['id', 'principalId', 'principalType', 'operations', 'resource'],
      `Repository permission grant ${index}`,
    )
    if (
      grant.principalType !== 'user' &&
      grant.principalType !== 'collaborator'
    ) {
      throw new DeploymentConfigurationError(
        `Repository permission grant ${index} has an invalid principal type`,
      )
    }
    if (
      !Array.isArray(grant.operations) ||
      grant.operations.length === 0 ||
      !grant.operations.every(
        (operation) =>
          typeof operation === 'string' && operations.has(operation),
      )
    ) {
      throw new DeploymentConfigurationError(
        `Repository permission grant ${index} has invalid operations`,
      )
    }
    const resource = grant.resource
    if (resource.type === 'repository') {
      assertOnlyKeys(
        resource,
        ['type'],
        `Repository permission grant ${index} resource`,
      )
    } else if (
      resource.type === 'collection' ||
      resource.type === 'media' ||
      resource.type === 'action'
    ) {
      assertOnlyKeys(
        resource,
        ['type', 'name'],
        `Repository permission grant ${index} resource`,
      )
      requiredString(
        resource.name,
        `Repository permission grant ${index} resource name`,
      )
    } else {
      throw new DeploymentConfigurationError(
        `Repository permission grant ${index} has an invalid resource`,
      )
    }

    return Object.freeze({
      id: requiredString(grant.id, `Repository permission grant ${index} id`),
      principalId: requiredString(
        grant.principalId,
        `Repository permission grant ${index} principal`,
      ),
      principalType: grant.principalType,
      operations: Object.freeze([
        ...new Set(grant.operations),
      ] as ApplicationOperation[]),
      resource: Object.freeze({ ...resource }) as RepositoryPermissionResource,
    })
  })
  return Object.freeze({
    version: requiredString(value.version, 'The permission snapshot version'),
    grants: Object.freeze(grants),
  })
}
