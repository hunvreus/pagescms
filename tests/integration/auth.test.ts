import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import { createPagesCmsAuth } from '#/server/auth.server'
import { createDatabase } from '#/server/database/client.server'
import { sessionTable, verificationTable } from '#/server/database/schema'

const url = process.env.TEST_DATABASE_URL
const integration = url ? describe : describe.skip
integration('authentication through the real HTTP handler', () => {
  it('issues a code, verifies identity, consumes it and rejects tampered or expired sessions and cross-origin mutations', async () => {
    const database = createDatabase({ url: url! })
    const send = vi.fn().mockResolvedValue(undefined)
    const origin = 'https://auth-test.example.com'
    const auth = createPagesCmsAuth({
      database,
      configuration: {
        baseUrl: origin,
        secret: 'auth-integration-secret-at-least-32-characters',
      },
      emailProvider: { send },
    })
    // Better Auth disables origin checks under NODE_ENV=test; use the production default here.
    ;(await auth.$context).skipOriginCheck = false
    const email = 'otp-integration@example.com'
    const post = (path: string, data: unknown, requestOrigin = origin) =>
      auth.handler(
        new Request(`${origin}/api/auth/${path}`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            origin: requestOrigin,
          },
          body: JSON.stringify(data),
        }),
      )
    const issued = await post('email-otp/send-verification-otp', {
      email,
      type: 'sign-in',
    })
    expect(issued.status).toBe(200)
    expect(send).toHaveBeenCalledOnce()
    const message = send.mock.calls[0][0]
    const otp = String(message.text ?? message.html).match(/\b\d{6}\b/)?.[0]
    expect(otp).toBeTruthy()
    const wrong = await post('sign-in/email-otp', { email, otp: 'not-a-code' })
    expect(wrong.ok).toBe(false)
    const signedIn = await post('sign-in/email-otp', { email, otp })
    expect(signedIn.status).toBe(200)
    const cookie = signedIn.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ')
    expect(cookie).toContain('session_token=')
    const getSession = (value: string) =>
      auth.handler(
        new Request(`${origin}/api/auth/get-session`, {
          headers: { cookie: value },
        }),
      )
    const session = z
      .object({
        user: z.object({
          id: z.string(),
          email: z.string(),
          emailVerified: z.boolean(),
        }),
      })
      .parse(await (await getSession(cookie)).json())
    expect(session.user).toMatchObject({ email, emailVerified: true })
    expect((await post('sign-in/email-otp', { email, otp })).ok).toBe(false)
    expect(
      await (
        await getSession(
          cookie.replace(/session_token=[^;]+/, 'session_token=tampered'),
        )
      ).json(),
    ).toBeNull()
    const hostile = await auth.handler(
      new Request(`${origin}/api/auth/sign-out`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'https://evil.example',
          cookie,
        },
        body: '{}',
      }),
    )
    expect(hostile.status).toBe(403)
    await database
      .update(sessionTable)
      .set({ expiresAt: new Date(0) })
      .where(eq(sessionTable.userId, session.user.id))
    expect(await (await getSession(cookie)).json()).toBeNull()
    await database.delete(verificationTable)
  })
})
