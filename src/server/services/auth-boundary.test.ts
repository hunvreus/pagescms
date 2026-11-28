import { describe, expect, it } from 'vitest'

import { authenticationState } from '#/server/services/authentication-state'

import type { RequestServices } from '#/server/context'

const invoke = ({ context }: { context: { getServices: () => unknown } }) =>
  authenticationState(context.getServices() as RequestServices)

describe('authentication menu permissions', () => {
  it.each([
    { email: 'editor@example.com', emailVerified: true, isAdmin: true },
    { email: 'EDITOR@example.com', emailVerified: true, isAdmin: true },
    { email: 'editor@example.com', emailVerified: false, isAdmin: false },
    { email: 'other@example.com', emailVerified: true, isAdmin: false },
  ])(
    'reports admin visibility for $email, verified=$emailVerified',
    async ({ email, emailVerified, isAdmin }) => {
      const state = await invoke({
        context: {
          getServices: () => ({
            getSession: async () => ({
              user: { id: 'editor', name: 'Editor', email, emailVerified },
            }),
            configuration: {
              adminEmails: ['editor@example.com'],
              auth: { secret: 'test-only-auth-secret-at-least-32-characters' },
            },
            authenticationMethods: { email: true },
          }),
        },
      })
      expect(state.isAdmin).toBe(isAdmin)
      expect(state.user?.email).toBe(email)
    },
  )

  it('never exposes admin navigation to guests', async () => {
    const state = await invoke({
      context: {
        getServices: () => ({
          getSession: async () => null,
          configuration: { adminEmails: ['editor@example.com'], auth: {} },
          authenticationMethods: { email: true },
        }),
      },
    })
    expect(state).toMatchObject({
      user: null,
      isAdmin: false,
    })
  })
})
