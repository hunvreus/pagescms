import { describe, expect, it, vi } from 'vitest'

import {
  authBaseUrl,
  createLoginCodeEmail,
  createPagesCmsAuth,
} from './auth.server'
import { createDatabase } from './database/client.server'

describe('createLoginCodeEmail', () => {
  it('escapes user-controlled values in the HTML body', () => {
    const message = createLoginCodeEmail('han+test@example.com', '<123456>')

    expect(message.subject).toContain('<123456>')
    expect(message.html).not.toContain('<123456>')
    expect(message.html).toContain('&lt;123456&gt;')
    expect(message.html).toContain('han+test@example.com')
  })
})

describe('authBaseUrl', () => {
  it('accepts the active localhost port while retaining a fallback', () => {
    expect(authBaseUrl('http://localhost:3000')).toEqual({
      allowedHosts: ['localhost:*', '127.0.0.1:*', '[::1]:*'],
      fallback: 'http://localhost:3000',
      protocol: 'http',
    })
  })

  it('keeps production origins exact', () => {
    expect(authBaseUrl('https://app.pagescms.org')).toBe(
      'https://app.pagescms.org',
    )
  })
})

describe('createPagesCmsAuth', () => {
  it('constructs the request-scoped Better Auth handler without connecting eagerly', () => {
    const database = createDatabase({
      connectionString: 'postgres://user:password@example.com/pagescms',
    })
    const auth = createPagesCmsAuth({
      database,
      configuration: {
        baseUrl: 'https://app.pagescms.org',
        secret: 'a-secure-auth-secret-with-32-characters',
        github: { clientId: 'client-id', clientSecret: 'client-secret' },
      },
      emailProvider: { send: vi.fn(async () => undefined) },
    })

    expect(auth.handler).toBeTypeOf('function')
    expect(auth.api.getSession).toBeTypeOf('function')
    expect(auth.options.onAPIError.errorURL).toBe('/auth/error')
  })
})
