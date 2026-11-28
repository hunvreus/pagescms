import { describe, expect, it, vi } from 'vitest'
import { api } from '#/server/routes/index'
import type { RequestServices } from '#/server/context'

const routes = [
  { path: '/api/admin/dashboard', method: 'GET' },
  { path: '/api/admin/allowlist', method: 'GET' },
  {
    path: '/api/admin/allowlist',
    method: 'POST',
    body: { action: 'add', type: 'email', value: 'user@example.com' },
  },
  {
    path: '/api/admin/actions',
    method: 'POST',
    body: { action: 'revoke-all' },
  },
] as const

describe('global admin HTTP boundaries', () => {
  it.each(routes)(
    'requires a session for $method $path',
    async ({ path, method, ...route }) => {
      const services = {
        getSession: async () => null,
      } as unknown as RequestServices
      const response = await api.request(
        `https://cms.test${path}`,
        {
          method,
          headers: {
            origin: 'https://cms.test',
            'content-type': 'application/json',
            authorization: 'Bearer unrelated-token',
            'x-pagescms-account': 'user',
          },
          ...(method === 'POST'
            ? { body: JSON.stringify('body' in route ? route.body : {}) }
            : {}),
        },
        { publicBaseUrl: 'https://cms.test', getServices: () => services },
      )
      expect(response.status).toBe(401)
    },
  )
  it.each(routes)(
    'rejects non-admin and unverified sessions for $method $path',
    async ({ path, method, ...route }) => {
      for (const user of [
        { email: 'user@example.test', emailVerified: true },
        { email: 'admin@example.test', emailVerified: false },
      ]) {
        const authorize = vi.fn()
        const services = {
          getSession: async () => ({
            user: { id: 'user', name: 'User', ...user },
          }),
          configuration: {
            adminEmails: ['admin@example.test'],
            auth: { baseUrl: 'https://cms.test' },
          },
          access: { authorize },
        } as unknown as RequestServices
        const response = await api.request(
          `https://cms.test${path}`,
          {
            method,
            headers: {
              origin: 'https://cms.test',
              'content-type': 'application/json',
              'x-pagescms-account': 'user',
            },
            ...(method === 'POST'
              ? { body: JSON.stringify('body' in route ? route.body : {}) }
              : {}),
          },
          { publicBaseUrl: 'https://cms.test', getServices: () => services },
        )
        expect(response.status).toBe(403)
        expect(await response.json()).toMatchObject({
          code: 'access_denied',
          reason: 'permission_denied',
        })
        expect(authorize).not.toHaveBeenCalled()
      }
    },
  )
})
