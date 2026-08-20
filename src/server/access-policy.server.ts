import type { ApplicationOperation } from '#/lib/application-operations'
import type { RepositoryRef } from '#/lib/repository'

export type AccessPrincipal =
  | Readonly<{ type: 'anonymous' }>
  | Readonly<{
      type: 'user' | 'collaborator' | 'service'
      id: string
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

export interface AccessPolicy {
  authorize: (request: AccessRequest) => Promise<AccessDecision>
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

export interface AccessPolicyGateway {
  authorize: (request: AccessRequest) => Promise<AccessGrant | undefined>
  execute: <T>(
    request: AccessRequest,
    operation: () => Promise<T>,
  ) => Promise<T>
  executeQuota: <T>(
    request: AccessRequest,
    idempotencyKey: string,
    operation: () => Promise<T>,
  ) => Promise<T>
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

  return {
    async authorize(request) {
      return requireGrant(await configuredPolicy.authorize(request))
    },

    async execute(request, operation) {
      requireGrant(await configuredPolicy.authorize(request))
      return operation()
    },

    async executeQuota(request, idempotencyKey, operation) {
      if (!configuredPolicy.reserve) {
        throw new AccessPolicyConfigurationError(
          'Quota operation requires policy reservation support',
        )
      }

      const grant = requireGrant(
        await configuredPolicy.reserve(request, idempotencyKey),
      )
      const reservation = grant?.reservation

      if (!reservation) {
        if (configuredPolicy === allowAllAccessPolicy) return operation()
        throw new AccessPolicyConfigurationError(
          'Quota policy did not return a reservation',
        )
      }
      if (!configuredPolicy.settle) {
        throw new AccessPolicyConfigurationError(
          'Quota operation requires policy settlement support',
        )
      }

      let result: Awaited<ReturnType<typeof operation>>
      try {
        result = await operation()
      } catch (error) {
        try {
          await configuredPolicy.settle(reservation, 'released')
        } catch {
          // The provider must reconcile idempotently. Preserve the domain error.
        }
        throw error
      }

      await configuredPolicy.settle(reservation, 'committed')
      return result
    },
  }
}
