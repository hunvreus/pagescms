import { createClient } from '@libsql/client'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { expect, it } from 'vitest'
import { createPagesCmsAuth } from '#/server/auth/index'
import { createLibSqlDatabase } from '#/server/db/client'
import { authenticationState } from '#/server/services/authentication-state'
import type { RequestServices } from '#/server/context'

it('uses a signed cached session after revocation unless a fresh read is requested', async () => {
  const client = createClient({ url: 'file::memory:' })
  const database = createLibSqlDatabase(client)
  try {
    await migrate(database, { migrationsFolder: './drizzle' })
    let code = ''
    const auth = createPagesCmsAuth({
      database,
      configuration: {
        baseUrl: 'https://cms.test',
        secret: 'fixture-auth-secret-with-at-least-32-characters',
        sessionCacheSeconds: 60,
      },
      emailProvider: {
        send: async (message) => {
          code = message.subject.match(/\d{6}/)?.[0] ?? ''
        },
      },
    })
    const post = (path: string, body: object) =>
      auth.handler(
        new Request(`https://cms.test/api/auth/${path}`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            origin: 'https://cms.test',
          },
          body: JSON.stringify(body),
        }),
      )
    expect(
      (
        await post('email-otp/send-verification-otp', {
          email: 'person@example.test',
          type: 'sign-in',
        })
      ).status,
    ).toBe(200)
    expect(code).toHaveLength(6)
    const signIn = await post('sign-in/email-otp', {
      email: 'person@example.test',
      otp: code,
    })
    expect(signIn.status).toBe(200)
    const cookie = signIn.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ')
    const headers = new Headers({ cookie })
    const state = await authenticationState({
      getSession: () => auth.api.getSession({ headers }),
      configuration: {
        auth: { secret: 'fixture-auth-secret-with-at-least-32-characters' },
        adminEmails: [],
      },
      authenticationMethods: { email: true },
    } as unknown as RequestServices)
    expect(state.user?.email).toBe('person@example.test')
    await client.execute('DELETE FROM session')
    expect(await auth.api.getSession({ headers })).not.toBeNull()
    expect(
      await auth.api.getSession({
        headers,
        query: { disableCookieCache: true },
      }),
    ).toBeNull()
  } finally {
    client.close()
  }
})

it('uses the configured language for sign-in emails when the browser has no preference', async () => {
  const client = createClient({ url: 'file::memory:' })
  const database = createLibSqlDatabase(client)
  try {
    await migrate(database, { migrationsFolder: './drizzle' })
    let html = ''
    const auth = createPagesCmsAuth({
      database,
      configuration: {
        baseUrl: 'https://cms.test',
        secret: 'fixture-auth-secret-with-at-least-32-characters',
        defaultLanguage: 'fr',
      },
      emailProvider: {
        send: async (message) => {
          html = message.html ?? ''
        },
      },
    })
    const response = await auth.handler(
      new Request('https://cms.test/api/auth/email-otp/send-verification-otp', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'https://cms.test',
        },
        body: JSON.stringify({ email: 'person@example.test', type: 'sign-in' }),
      }),
    )
    expect(response.status).toBe(200)
    expect(html).toContain('<html lang="fr">')
  } finally {
    client.close()
  }
})
