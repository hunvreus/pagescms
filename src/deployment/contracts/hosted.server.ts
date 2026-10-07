import type {
  AccessPrincipal,
  AccessTenant,
} from '#/server/access-policy.server'
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

export interface BillingSessions {
  options: (input: { accountId: string }) => Promise<{
    plans: readonly { id: string; label: string }[]
    canManage: boolean
  }>
  create: (input: {
    accountId: string
    email: string
    intent: 'checkout' | 'portal'
    priceId?: string
    idempotencyKey: string
  }) => Promise<{ url: string }>
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

export type RepositoryPermissionResource = Readonly<{
  type: 'collection' | 'media' | 'action'
  name: string
}>
export interface RepositoryRolePermission {
  id: string
  operations: 'all' | readonly ApplicationOperation[]
  resource: RepositoryPermissionResource
}
export interface RepositoryRole {
  id: string
  label: string
  permissions: readonly RepositoryRolePermission[]
}
export interface RepositoryRoleAssignment {
  principalId: string
  branches: 'all' | readonly string[]
  roles: readonly string[]
}
export interface RepositoryPermissions {
  version: string
  roles: readonly RepositoryRole[]
  assignments: readonly RepositoryRoleAssignment[]
}
export interface RepositoryPermissionAdmin {
  read: (repository: {
    owner: string
    repo: string
  }) => Promise<RepositoryPermissions>
  replace: (input: {
    owner: string
    repo: string
    expectedVersion: string
    roles: readonly RepositoryRole[]
    assignments: readonly RepositoryRoleAssignment[]
    actorId: string
  }) => Promise<RepositoryPermissions>
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

export const RESOURCE_OPERATIONS = {
  collection: [
    'collection.read',
    'entry.read',
    'entry.create',
    'entry.update',
    'entry.rename',
    'entry.delete',
    'entry.history',
    'reference.read',
  ],
  media: ['media.read', 'media.write', 'media.rename', 'media.delete'],
  action: ['action.read', 'action.run', 'action.cancel', 'action.rerun'],
} as const satisfies Record<string, readonly ApplicationOperation[]>
export const FULL_ACCESS_ROLE = 'full-access'

export function validateRepositoryPermissions(
  value: unknown,
): RepositoryPermissions {
  if (!isRecord(value))
    throw new DeploymentConfigurationError(
      'Repository permissions must be an object',
    )
  assertOnlyKeys(
    value,
    ['version', 'roles', 'assignments'],
    'Repository permissions',
  )
  if (
    typeof value.version !== 'string' ||
    !/^(0|[1-9]\d*)$/.test(value.version) ||
    !Number.isSafeInteger(Number(value.version))
  )
    throw new DeploymentConfigurationError('Invalid permission version')
  if (
    !Array.isArray(value.roles) ||
    value.roles.length > 100 ||
    !Array.isArray(value.assignments) ||
    value.assignments.length > 1000
  )
    throw new DeploymentConfigurationError('Invalid roles or assignments')
  const unique = (values: readonly string[], label: string) => {
    if (new Set(values).size !== values.length)
      throw new DeploymentConfigurationError(`Duplicate ${label}`)
  }
  const strings = (values: unknown, label: string): readonly string[] => {
    if (!Array.isArray(values) || values.length > 1000)
      throw new DeploymentConfigurationError(`Invalid ${label}`)
    const result = values.map((v) => requiredString(v, label))
    unique(result, label)
    return Object.freeze(result)
  }
  const roles = value.roles.map((role) => {
    if (!isRecord(role)) throw new DeploymentConfigurationError('Invalid role')
    assertOnlyKeys(role, ['id', 'label', 'permissions'], 'Role')
    const id = requiredString(role.id, 'Role ID')
    if (id === FULL_ACCESS_ROLE)
      throw new DeploymentConfigurationError('Full access is a built-in role')
    if (!Array.isArray(role.permissions) || role.permissions.length > 100)
      throw new DeploymentConfigurationError('Invalid role permissions')
    const permissions = role.permissions.map((p) => {
      if (!isRecord(p) || !isRecord(p.resource))
        throw new DeploymentConfigurationError('Invalid role permission')
      assertOnlyKeys(p, ['id', 'resource', 'operations'], 'Role permission')
      assertOnlyKeys(p.resource, ['type', 'name'], 'Permission resource')
      const type = p.resource.type
      if (type !== 'collection' && type !== 'media' && type !== 'action')
        throw new DeploymentConfigurationError('Invalid resource type')
      const operations =
        p.operations === 'all'
          ? ('all' as const)
          : strings(p.operations, 'operations')
      if (
        operations !== 'all' &&
        (!operations.length ||
          !operations.every((op) =>
            (RESOURCE_OPERATIONS[type] as readonly string[]).includes(op),
          ))
      )
        throw new DeploymentConfigurationError(
          'Invalid operations for resource',
        )
      return Object.freeze({
        id: requiredString(p.id, 'Permission ID'),
        operations: operations as 'all' | readonly ApplicationOperation[],
        resource: Object.freeze({
          type,
          name: requiredString(p.resource.name, 'Resource name'),
        }),
      })
    })
    unique(
      permissions.map((p) => p.id),
      'permission IDs',
    )
    return Object.freeze({
      id,
      label: requiredString(role.label, 'Role label'),
      permissions: Object.freeze(permissions),
    })
  })
  unique(
    roles.map((r) => r.id),
    'role IDs',
  )
  const assignments = value.assignments.map((a) => {
    if (!isRecord(a))
      throw new DeploymentConfigurationError('Invalid role assignment')
    assertOnlyKeys(a, ['principalId', 'branches', 'roles'], 'Role assignment')
    return Object.freeze({
      principalId: requiredString(a.principalId, 'Collaborator ID'),
      branches:
        a.branches === 'all'
          ? ('all' as const)
          : strings(a.branches, 'branches'),
      roles: strings(a.roles, 'assigned roles'),
    })
  })
  unique(
    assignments.map((a) => a.principalId),
    'collaborator assignments',
  )
  return Object.freeze({
    version: value.version,
    roles: Object.freeze(roles),
    assignments: Object.freeze(assignments),
  })
}
