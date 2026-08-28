import { describe, expect, it } from 'vitest'

import {
  validateEntitlementSnapshot,
  validateRepositoryPermissionSnapshot,
} from './hosted.server'

describe('hosted deployment projections', () => {
  it('accepts and freezes a safe entitlement snapshot', () => {
    const snapshot = validateEntitlementSnapshot({
      policyVersion: 'policy-1',
      status: 'active',
      planLabel: 'Pro',
      usage: [{ key: 'media', label: 'Media', used: 4, limit: 100 }],
      billingPortalUrl: 'https://billing.example.com/portal',
    })

    expect(snapshot.status).toBe('active')
    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(Object.isFrozen(snapshot.usage)).toBe(true)
  })

  it('rejects unsafe URLs, vendor fields, and invalid counters', () => {
    expect(() =>
      validateEntitlementSnapshot({
        policyVersion: '1',
        status: 'active',
        planLabel: 'Pro',
        usage: [],
        customerId: 'cus_secret',
      }),
    ).toThrow(/unsupported key: customerId/)
    expect(() =>
      validateEntitlementSnapshot({
        policyVersion: '1',
        status: 'active',
        planLabel: 'Pro',
        usage: [],
        upgradeUrl: 'javascript:alert(1)',
      }),
    ).toThrow(/HTTP URL/)
    expect(() =>
      validateEntitlementSnapshot({
        policyVersion: '1',
        status: 'active',
        planLabel: 'Pro',
        usage: [{ key: 'media', label: 'Media', used: -1, limit: 10 }],
      }),
    ).toThrow(/invalid values/)
  })

  it('accepts known permission operations and rejects unknown authority', () => {
    const snapshot = validateRepositoryPermissionSnapshot({
      version: '1',
      grants: [
        {
          id: 'grant-1',
          principalId: 'user-1',
          principalType: 'user',
          operations: ['entry.read', 'entry.update'],
          resource: { type: 'collection', name: 'posts' },
        },
      ],
    })
    expect(snapshot.grants[0].operations).toEqual([
      'entry.read',
      'entry.update',
    ])

    expect(() =>
      validateRepositoryPermissionSnapshot({
        version: '1',
        grants: [
          {
            id: 'grant-1',
            principalId: 'user-1',
            principalType: 'user',
            operations: ['root.everything'],
            resource: { type: 'repository' },
          },
        ],
      }),
    ).toThrow(/invalid operations/)
  })
})
