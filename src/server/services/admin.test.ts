import { expect, it, vi } from 'vitest'
import { executeAdminAction } from '#/server/services/admin'
import type { RequestServices } from '#/server/context'
import type { ServiceUser } from '#/server/services/context'

it('rejects unverified or non-admin users before authorizing admin actions', async () => {
  const authorize = vi.fn()
  const services = {
    configuration: {
      adminEmails: ['admin@example.test'],
      auth: { baseUrl: 'https://cms.test' },
    },
    access: { authorize },
  } as unknown as RequestServices
  const user = {
    id: 'user',
    name: 'User',
    email: 'admin@example.test',
    emailVerified: false,
    githubUsername: null,
  } satisfies ServiceUser
  const action = { action: 'revoke-all', userId: null, target: 'all' } as const
  await expect(executeAdminAction(services, user, action)).rejects.toThrow(
    'Admin access required',
  )
  await expect(
    executeAdminAction(
      services,
      { ...user, email: 'other@example.test', emailVerified: true },
      action,
    ),
  ).rejects.toThrow('Admin access required')
  expect(authorize).not.toHaveBeenCalled()
})
