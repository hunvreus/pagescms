import type { ApplicationOperation } from '#/shared/application-operations'
import type { RepositoryRef } from '#/lib/repository'

export type AccessPrincipal =
  | Readonly<{ type: 'anonymous' }>
  | Readonly<{
      type: 'user' | 'collaborator' | 'service'
      id: string
      collaboratorKey?: string
      membershipId?: string
      repositoryIdentity?: Readonly<{
        source: string
        externalId: string
        ownerId?: string
      }>
    }>

export type AccessTenant = Readonly<{
  type:
    'deployment' | 'account' | 'organization' | 'installation' | 'repository'
  id: string
}>

export type AccessTarget = Readonly<{
  repository?: RepositoryRef
  branch?: string
  collection?: string
  media?: string
  path?: string
  visibility?: 'public' | 'private'
}>

export type AccessFact = string | number | boolean | null

export type AccessRequest = Readonly<{
  operation: ApplicationOperation
  principal: AccessPrincipal
  tenant: AccessTenant
  target?: AccessTarget
  facts?: Readonly<Record<string, AccessFact>>
}>

export type AccessDenialReason =
  | 'authentication_required'
  | 'permission_denied'
  | 'quota_exceeded'
  | 'feature_unavailable'
  | 'policy_unavailable'

export type PolicyReservation = Readonly<{ id: string }>

export type AccessGrant = Readonly<{
  policyVersion?: string
  // Return these on repository.read for UI eligibility and on the actual operation for execution.
  delegatedOperations?: readonly ApplicationOperation[]
  /** Narrow controls shown on a permitted read; mutations still authorize independently. */
  deniedOperations?: readonly ApplicationOperation[]
  reservation?: PolicyReservation
}>

export type AccessDecision =
  | Readonly<{ allowed: true; grant?: AccessGrant }>
  | Readonly<{
      allowed: false
      reason: AccessDenialReason
      actionUrl?: string
    }>

export type AccessDiscoveryResource = Readonly<{
  type: 'collection' | 'media' | 'action' | 'branch'
  name: string
}>

export type AccessDiscoveryRequest = Readonly<{
  operation?: ApplicationOperation
  principal: AccessPrincipal
  tenant: AccessTenant
  target?: AccessTarget
  resources: readonly AccessDiscoveryResource[]
}>

export type AccessDiscoveryDecision =
  | Readonly<{ visibility: 'all' }>
  | Readonly<{ visibility: 'none' }>
  | Readonly<{
      visibility: 'filtered'
      resources: readonly AccessDiscoveryResource[]
    }>

export interface AccessPolicy {
  authorize: (request: AccessRequest) => Promise<AccessDecision>
  authorizeMany?: (
    requests: readonly AccessRequest[],
  ) => Promise<readonly AccessDecision[]>
  discover?: (
    request: AccessDiscoveryRequest,
  ) => Promise<AccessDiscoveryDecision>
  reserve?: (
    request: AccessRequest,
    idempotencyKey: string,
  ) => Promise<AccessDecision>
  settle?: (
    reservation: PolicyReservation,
    outcome: 'committed' | 'released',
  ) => Promise<void>
}

export const allowAllAccessPolicy: AccessPolicy = Object.freeze({
  authorize: async () => ({
    allowed: true as const,
    grant: { policyVersion: 'default-access-v1' },
  }),
  discover: async () => ({ visibility: 'all' as const }),
})

export class AccessDeniedError extends Error {
  readonly reason: AccessDenialReason
  readonly actionUrl?: string

  constructor(
    decision: Extract<AccessDecision, { allowed: false }>,
    message?: string,
  ) {
    super(message ?? `Access denied: ${decision.reason}`)
    this.name = 'AccessDeniedError'
    this.reason = decision.reason
    this.actionUrl = decision.actionUrl
  }
}

export class AccessPolicyConfigurationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AccessPolicyConfigurationError'
  }
}

const SETTLEMENT_RETRY_DELAYS_MS = [0, 100, 400] as const

async function wait(milliseconds: number) {
  if (milliseconds <= 0) return
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
}

export interface AccessPolicyGateway {
  readonly hasPolicy: boolean
  authorize: (request: AccessRequest) => Promise<AccessGrant | undefined>
  authorizeMany: (
    requests: readonly AccessRequest[],
  ) => Promise<readonly (AccessGrant | undefined)[]>
  discover: (
    request: AccessDiscoveryRequest,
  ) => Promise<AccessDiscoveryDecision>
  execute: <T>(
    request: AccessRequest,
    operation: (grant: AccessGrant | undefined) => Promise<T>,
  ) => Promise<T>
  executeQuota: <T>(
    request: AccessRequest,
    idempotencyKey: string,
    operation: () => Promise<T>,
  ) => Promise<T>
  reserveQuota: (
    request: AccessRequest,
    idempotencyKey: string,
  ) => Promise<PolicyReservation>
  settleQuota: (
    reservation: PolicyReservation,
    outcome: 'committed' | 'released',
  ) => Promise<void>
}

function requireGrant(decision: AccessDecision) {
  if (!decision.allowed) throw new AccessDeniedError(decision)
  return decision.grant
}

export function assertAccessBatchSize(requests: readonly AccessRequest[]) {
  if (requests.length > 1000)
    throw new AccessPolicyConfigurationError(
      'Authorization batches cannot exceed 1000 requests',
    )
}

/** Validate the optional policy capability before any grant is used. */
export async function authorizePolicyBatch(
  policy: AccessPolicy,
  requests: readonly AccessRequest[],
) {
  assertAccessBatchSize(requests)
  if (!policy.authorizeMany)
    throw new AccessPolicyConfigurationError(
      'Policy does not support batch authorization',
    )
  const decisions = await policy.authorizeMany(requests)
  if (
    !Array.isArray(decisions) ||
    decisions.length !== requests.length ||
    Array.from(decisions).some(
      (decision) =>
        !decision ||
        typeof decision !== 'object' ||
        typeof decision.allowed !== 'boolean',
    )
  )
    throw new AccessPolicyConfigurationError(
      'Batch policy must return one ordered decision per request',
    )
  return decisions
}

export function createAccessPolicyGateway({
  required = false,
  policy,
}: {
  required?: boolean
  policy?: AccessPolicy
}): AccessPolicyGateway {
  if (required && !policy) {
    throw new AccessPolicyConfigurationError(
      'This configuration requires an access policy',
    )
  }

  const configuredPolicy = policy ?? allowAllAccessPolicy

  async function reserveQuota(request: AccessRequest, idempotencyKey: string) {
    if (!configuredPolicy.reserve) {
      requireGrant(await configuredPolicy.authorize(request))
      return { id: `unmetered:${idempotencyKey}` }
    }

    const grant = requireGrant(
      await configuredPolicy.reserve(request, idempotencyKey),
    )
    const reservation = grant?.reservation
    if (reservation) return reservation
    throw new AccessPolicyConfigurationError(
      'Quota policy did not return a reservation',
    )
  }

  async function settleQuota(
    reservation: PolicyReservation,
    outcome: 'committed' | 'released',
  ) {
    if (!configuredPolicy.reserve) return
    if (!configuredPolicy.settle) {
      throw new AccessPolicyConfigurationError(
        'Quota operation requires policy settlement support',
      )
    }
    let lastError: unknown
    for (const delay of SETTLEMENT_RETRY_DELAYS_MS) {
      await wait(delay)
      try {
        await configuredPolicy.settle(reservation, outcome)
        return
      } catch (error) {
        lastError = error
      }
    }
    throw lastError
  }

  return {
    hasPolicy: Boolean(policy),
    async authorize(request) {
      return requireGrant(await configuredPolicy.authorize(request))
    },

    async authorizeMany(requests) {
      assertAccessBatchSize(requests)
      if (!requests.length) return []
      if (configuredPolicy.authorizeMany)
        return (await authorizePolicyBatch(configuredPolicy, requests)).map(
          requireGrant,
        )
      const grants: (AccessGrant | undefined)[] = []
      for (const request of requests)
        grants.push(requireGrant(await configuredPolicy.authorize(request)))
      return grants
    },

    async discover(request) {
      if (configuredPolicy.discover) return configuredPolicy.discover(request)
      return { visibility: 'all' }
    },

    async execute(request, operation) {
      const grant = requireGrant(await configuredPolicy.authorize(request))
      return operation(grant)
    },

    async executeQuota(request, idempotencyKey, operation) {
      const reservation = await reserveQuota(request, idempotencyKey)

      let result: Awaited<ReturnType<typeof operation>>
      try {
        result = await operation()
      } catch (error) {
        try {
          await settleQuota(reservation, 'released')
        } catch {
          // The provider must reconcile idempotently. Preserve the domain error.
        }
        throw error
      }

      await settleQuota(reservation, 'committed')
      return result
    },
    reserveQuota,
    settleQuota,
  }
}
