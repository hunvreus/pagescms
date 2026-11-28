import { describe, expect, it, vi } from 'vitest'

import {
  AccessDeniedError,
  allowAllAccessPolicy,
  createAccessPolicyGateway,
} from '#/server/access/policy'

import type { AccessPolicy, AccessRequest } from '#/server/access/policy'

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
    const gateway = createAccessPolicyGateway({ required: false })
    const action = vi.fn(async () => 'saved')

    await expect(gateway.execute(request, action)).resolves.toBe('saved')
    expect(action).toHaveBeenCalledOnce()
    await expect(allowAllAccessPolicy.authorize(request)).resolves.toEqual({
      allowed: true,
      grant: { policyVersion: 'default-access-v1' },
    })
  })

  it('refuses to create a required gateway without its registered policy', () => {
    expect(() => createAccessPolicyGateway({ required: true })).toThrow(
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
      required: true,
      policy,
    })

    await expect(gateway.execute(request, action)).rejects.toMatchObject({
      name: 'AccessDeniedError',
      reason: 'permission_denied',
    })
    expect(action).not.toHaveBeenCalled()
  })

  it('projects batched resource discovery without authorizing the client', async () => {
    const discover = vi.fn(async () => ({
      visibility: 'filtered' as const,
      resources: [{ type: 'collection' as const, name: 'posts' }],
    }))
    const gateway = createAccessPolicyGateway({
      required: true,
      policy: { authorize: async () => ({ allowed: true }), discover },
    })
    const discovery = {
      principal: request.principal,
      tenant: request.tenant,
      target: request.target,
      resources: [
        { type: 'collection' as const, name: 'posts' },
        { type: 'collection' as const, name: 'drafts' },
      ],
    }

    await expect(gateway.discover(discovery)).resolves.toEqual({
      visibility: 'filtered',
      resources: [{ type: 'collection', name: 'posts' }],
    })
    expect(discover).toHaveBeenCalledWith(discovery)
  })

  it('fails closed when the custom policy throws', async () => {
    const action = vi.fn(async () => 'secret')
    const gateway = createAccessPolicyGateway({
      required: true,
      policy: {
        authorize: async () => {
          throw new Error('policy unavailable')
        },
      },
    })

    await expect(gateway.execute(request, action)).rejects.toThrow(
      'policy unavailable',
    )
    expect(action).not.toHaveBeenCalled()
  })

  it('exposes typed denial details without provider internals', () => {
    const error = new AccessDeniedError({
      allowed: false,
      reason: 'feature_unavailable',
      actionUrl: '/help/access',
    })

    expect(error).toMatchObject({
      reason: 'feature_unavailable',
      actionUrl: '/help/access',
      message: 'Access denied: feature_unavailable',
    })
  })
})

describe('quota-consuming operations', () => {
  it('supports a reservation spanning separate initiate and confirm requests', async () => {
    const settle = vi.fn(async () => undefined)
    const gateway = createAccessPolicyGateway({
      required: true,
      policy: {
        authorize: async () => ({ allowed: true }),
        reserve: async () => ({
          allowed: true,
          grant: { reservation: { id: 'upload-reservation' } },
        }),
        settle,
      },
    })

    const reservation = await gateway.reserveQuota(
      { ...request, operation: 'media.write' },
      'upload:1',
    )
    expect(reservation).toEqual({ id: 'upload-reservation' })
    await gateway.settleQuota(reservation, 'committed')
    expect(settle).toHaveBeenCalledWith(reservation, 'committed')
  })

  it('retries idempotent quota settlement after transient policy failures', async () => {
    vi.useFakeTimers()
    const settle = vi
      .fn<NonNullable<AccessPolicy['settle']>>()
      .mockRejectedValueOnce(new Error('database unavailable'))
      .mockRejectedValueOnce(new Error('database reconnecting'))
      .mockResolvedValueOnce(undefined)
    const gateway = createAccessPolicyGateway({
      required: true,
      policy: {
        authorize: async () => ({ allowed: true }),
        reserve: async () => ({
          allowed: true,
          grant: { reservation: { id: 'upload-reservation' } },
        }),
        settle,
      },
    })

    const result = gateway.settleQuota(
      { id: 'upload-reservation' },
      'committed',
    )
    await vi.runAllTimersAsync()

    await expect(result).resolves.toBeUndefined()
    expect(settle).toHaveBeenCalledTimes(3)
    vi.useRealTimers()
  })

  it('uses an unmetered reservation for self-hosted split operations', async () => {
    const gateway = createAccessPolicyGateway({ required: false })
    const reservation = await gateway.reserveQuota(request, 'upload:local')
    expect(reservation).toEqual({ id: 'unmetered:upload:local' })
    await expect(
      gateway.settleQuota(reservation, 'released'),
    ).resolves.toBeUndefined()
  })

  it('atomically reserves and commits around the protected operation', async () => {
    const events: string[] = []
    const policy: AccessPolicy = {
      authorize: async () => ({ allowed: true }),
      reserve: async () => {
        events.push('reserve')
        return {
          allowed: true,
          grant: {
            policyVersion: 'custom-v2',
            reservation: { id: 'reservation-1' },
          },
        }
      },
      settle: async (_reservation, outcome) => {
        events.push(outcome)
      },
    }
    const gateway = createAccessPolicyGateway({
      required: true,
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
      required: true,
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
      required: true,
      policy,
    })

    await expect(
      gateway.executeQuota(request, 'entry:update:2', action),
    ).rejects.toMatchObject({ reason: 'quota_exceeded' })
    expect(action).not.toHaveBeenCalled()
    expect(policy.settle).not.toHaveBeenCalled()
  })
})

describe('batch authorization', () => {
  it('uses ordered individual checks and stops at the first denial without a batch capability', async () => {
    const authorize = vi.fn(async (value: AccessRequest) =>
      value.target?.path === 'denied'
        ? { allowed: false as const, reason: 'permission_denied' as const }
        : { allowed: true as const },
    )
    const gateway = createAccessPolicyGateway({ policy: { authorize } })
    const inputs = ['ok', 'denied', 'later'].map((path) => ({
      ...request,
      target: { ...request.target, path },
    }))
    await expect(gateway.authorizeMany(inputs)).rejects.toMatchObject({
      name: 'AccessDeniedError',
      reason: 'permission_denied',
    })
    expect(authorize.mock.calls.map(([value]) => value.target?.path)).toEqual([
      'ok',
      'denied',
    ])
  })
  it('uses one batch call, retains distinct grants and rejects malformed results', async () => {
    const authorize = vi.fn(async () => ({ allowed: true as const }))
    const authorizeMany = vi
      .fn<NonNullable<AccessPolicy['authorizeMany']>>()
      .mockResolvedValue([
        { allowed: true, grant: { policyVersion: 'first' } },
        { allowed: true, grant: { policyVersion: 'second' } },
      ])
    const gateway = createAccessPolicyGateway({
      policy: { authorize, authorizeMany },
    })
    expect(await gateway.authorizeMany([request, request])).toEqual([
      { policyVersion: 'first' },
      { policyVersion: 'second' },
    ])
    expect(authorize).not.toHaveBeenCalled()
    expect(authorizeMany).toHaveBeenCalledTimes(1)
    authorizeMany.mockResolvedValueOnce([{ allowed: true }])
    await expect(gateway.authorizeMany([request, request])).rejects.toThrow(
      'one ordered decision',
    )
    await expect(
      gateway.authorizeMany(Array.from({ length: 1001 }, () => request)),
    ).rejects.toThrow('1000')
    expect(await gateway.authorizeMany([])).toEqual([])
  })
  it('throws the first denial in input order and propagates batch failures', async () => {
    const authorizeMany = vi
      .fn<NonNullable<AccessPolicy['authorizeMany']>>()
      .mockResolvedValue([
        { allowed: true },
        { allowed: false, reason: 'permission_denied' },
        { allowed: false, reason: 'feature_unavailable' },
      ])
    const gateway = createAccessPolicyGateway({
      policy: { authorize: async () => ({ allowed: true }), authorizeMany },
    })
    await expect(
      gateway.authorizeMany([request, request, request]),
    ).rejects.toMatchObject({ reason: 'permission_denied' })
    authorizeMany.mockRejectedValueOnce(new Error('Database unavailable'))
    await expect(gateway.authorizeMany([request])).rejects.toThrow(
      'Database unavailable',
    )
  })
})
