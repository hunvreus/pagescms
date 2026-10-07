import type { ApplicationOperation } from '#/lib/application-operations'
import type { RepositoryRef } from '#/lib/repository'

export type AccessPrincipal =
  | Readonly<{ type: 'anonymous' }>
  | Readonly<{
      type: 'user' | 'collaborator' | 'service'
      id: string
      collaboratorKey?: string
      roles?: readonly string[]
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
  | 'plan_required'
  | 'quota_exceeded'
  | 'feature_unavailable'
  | 'policy_unavailable'

export type PolicyReservation = Readonly<{ id: string }>

export type AccessGrant = Readonly<{
  policyVersion?: string
  reservation?: PolicyReservation
}>

export type AccessDecision =
  | Readonly<{ allowed: true; grant?: AccessGrant }>
  | Readonly<{
      allowed: false
      reason: AccessDenialReason
      upgradeUrl?: string
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
    grant: { policyVersion: 'self-hosted-allow-all-v1' },
  }),
  reserve: async () => ({
    allowed: true as const,
    grant: { policyVersion: 'self-hosted-allow-all-v1' },
  }),
  discover: async () => ({ visibility: 'all' as const }),
})

export class AccessDeniedError extends Error {
  readonly reason: AccessDenialReason
  readonly upgradeUrl?: string

  constructor(decision: Extract<AccessDecision, { allowed: false }>) {
    super(`Access denied: ${decision.reason}`)
    this.name = 'AccessDeniedError'
    this.reason = decision.reason
    this.upgradeUrl = decision.upgradeUrl
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
  authorize: (request: AccessRequest) => Promise<AccessGrant | undefined>
  discover: (
    request: AccessDiscoveryRequest,
  ) => Promise<AccessDiscoveryDecision>
  execute: <T>(
    request: AccessRequest,
    operation: () => Promise<T>,
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

export function createAccessPolicyGateway({
  deployment,
  policy,
}: {
  deployment: 'self-hosted' | 'hosted'
  policy?: AccessPolicy
}): AccessPolicyGateway {
  if (deployment === 'hosted' && !policy) {
    throw new AccessPolicyConfigurationError(
      'Hosted deployment requires an access policy',
    )
  }

  const configuredPolicy = policy ?? allowAllAccessPolicy

  async function reserveQuota(request: AccessRequest, idempotencyKey: string) {
    if (!configuredPolicy.reserve) {
      throw new AccessPolicyConfigurationError(
        'Quota operation requires policy reservation support',
      )
    }

    const grant = requireGrant(
      await configuredPolicy.reserve(request, idempotencyKey),
    )
    const reservation = grant?.reservation
    if (reservation) return reservation
    if (configuredPolicy === allowAllAccessPolicy) {
      return { id: `unmetered:${idempotencyKey}` }
    }
    throw new AccessPolicyConfigurationError(
      'Quota policy did not return a reservation',
    )
  }

  async function settleQuota(
    reservation: PolicyReservation,
    outcome: 'committed' | 'released',
  ) {
    if (configuredPolicy === allowAllAccessPolicy) return
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
    async authorize(request) {
      return requireGrant(await configuredPolicy.authorize(request))
    },

    async discover(request) {
      if (configuredPolicy.discover) return configuredPolicy.discover(request)
      return { visibility: 'all' }
    },

    async execute(request, operation) {
      requireGrant(await configuredPolicy.authorize(request))
      return operation()
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
