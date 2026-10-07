import { describe, expect, it } from 'vitest'

import {
  validateEntitlementSnapshot,
  validateRepositoryPermissions,
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
    const snapshot = validateRepositoryPermissions({
      version: '1',
      assignments: [],
      roles: [
        {
          id: 'editor',
          label: 'Editor',
          permissions: [
            {
              id: 'grant-1',
              operations: ['entry.read', 'entry.update'],
              resource: { type: 'collection', name: 'posts' },
            },
          ],
        },
      ],
    })
    expect(snapshot.roles[0].permissions[0].operations).toEqual([
      'entry.read',
      'entry.update',
    ])

    expect(() =>
      validateRepositoryPermissions({
        version: '1',
        assignments: [],
        roles: [
          {
            id: 'editor',
            label: 'Editor',
            permissions: [
              {
                id: 'grant-1',
                operations: ['root.everything'],
                resource: { type: 'collection', name: 'all' },
              },
            ],
          },
        ],
      }),
    ).toThrow(/Invalid operations/)
  })
})
