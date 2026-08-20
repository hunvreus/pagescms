import { describe, expect, it, vi } from 'vitest'

import {
  AccessDeniedError,
  allowAllAccessPolicy,
  createAccessPolicyGateway,
} from './access-policy.server'

import type { AccessPolicy, AccessRequest } from './access-policy.server'

const request: AccessRequest = {
  operation: 'entry.update',
  principal: { type: 'user', id: 'user-1' },
  tenant: { type: 'repository', id: 'hunvreus/pagescms' },
  target: {
    repository: { owner: 'hunvreus', repo: 'pagescms' },
    branch: 'main',
    collection: 'posts',
    path: 'content/posts/hello.md',
  },
}

describe('access-policy gateway', () => {
  it('uses the explicit allow policy for ordinary self-hosting', async () => {
    const gateway = createAccessPolicyGateway({ deployment: 'self-hosted' })
    const action = vi.fn(async () => 'saved')

    await expect(gateway.execute(request, action)).resolves.toBe('saved')
    expect(action).toHaveBeenCalledOnce()
    await expect(allowAllAccessPolicy.authorize(request)).resolves.toEqual({
      allowed: true,
      grant: { policyVersion: 'self-hosted-allow-all-v1' },
    })
  })

  it('refuses to create a hosted gateway without its registered policy', () => {
    expect(() => createAccessPolicyGateway({ deployment: 'hosted' })).toThrow(
      'requires an access policy',
    )
  })

  it('does not perform a protected read or side effect when denied', async () => {
    const action = vi.fn(async () => 'secret')
    const policy: AccessPolicy = {
      authorize: vi.fn(async () => ({
        allowed: false as const,
        reason: 'permission_denied' as const,
      })),
    }
    const gateway = createAccessPolicyGateway({
      deployment: 'hosted',
      policy,
    })

    await expect(gateway.execute(request, action)).rejects.toMatchObject({
      name: 'AccessDeniedError',
      reason: 'permission_denied',
    })
    expect(action).not.toHaveBeenCalled()
  })

  it('fails closed when the hosted policy throws', async () => {
    const action = vi.fn(async () => 'secret')
    const gateway = createAccessPolicyGateway({
      deployment: 'hosted',
      policy: {
        authorize: async () => {
          throw new Error('billing unavailable')
        },
      },
    })

    await expect(gateway.execute(request, action)).rejects.toThrow(
      'billing unavailable',
    )
    expect(action).not.toHaveBeenCalled()
  })

  it('exposes typed denial details without provider internals', () => {
    const error = new AccessDeniedError({
      allowed: false,
      reason: 'plan_required',
      upgradeUrl: '/billing',
    })

    expect(error).toMatchObject({
      reason: 'plan_required',
      upgradeUrl: '/billing',
      message: 'Access denied: plan_required',
    })
  })
})

describe('quota-consuming operations', () => {
  it('atomically reserves and commits around the protected operation', async () => {
    const events: string[] = []
    const policy: AccessPolicy = {
      authorize: async () => ({ allowed: true }),
      reserve: async () => {
        events.push('reserve')
        return {
          allowed: true,
          grant: {
            policyVersion: 'paid-v2',
            reservation: { id: 'reservation-1' },
          },
        }
      },
      settle: async (_reservation, outcome) => {
        events.push(outcome)
      },
    }
    const gateway = createAccessPolicyGateway({
      deployment: 'hosted',
      policy,
    })

    await gateway.executeQuota(
      { ...request, operation: 'repository.connect' },
      'connect:github:123',
      async () => {
        events.push('action')
        return 'connected'
      },
    )

    expect(events).toEqual(['reserve', 'action', 'committed'])
  })

  it('releases a reservation when the underlying operation fails', async () => {
    const settle = vi.fn(async () => undefined)
    const policy: AccessPolicy = {
      authorize: async () => ({ allowed: true }),
      reserve: async () => ({
        allowed: true,
        grant: { reservation: { id: 'reservation-1' } },
      }),
      settle,
    }
    const gateway = createAccessPolicyGateway({
      deployment: 'hosted',
      policy,
    })

    await expect(
      gateway.executeQuota(request, 'entry:update:1', async () => {
        throw new Error('GitHub conflict')
      }),
    ).rejects.toThrow('GitHub conflict')
    expect(settle).toHaveBeenCalledWith({ id: 'reservation-1' }, 'released')
  })

  it('never runs the operation when reservation is denied', async () => {
    const action = vi.fn()
    const policy: AccessPolicy = {
      authorize: async () => ({ allowed: true }),
      reserve: async () => ({
        allowed: false,
        reason: 'quota_exceeded',
      }),
      settle: vi.fn(),
    }
    const gateway = createAccessPolicyGateway({
      deployment: 'hosted',
      policy,
    })

    await expect(
      gateway.executeQuota(request, 'entry:update:2', action),
    ).rejects.toMatchObject({ reason: 'quota_exceeded' })
    expect(action).not.toHaveBeenCalled()
    expect(policy.settle).not.toHaveBeenCalled()
  })
})
