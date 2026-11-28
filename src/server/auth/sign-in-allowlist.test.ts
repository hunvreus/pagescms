import { createClient } from '@libsql/client'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { expect, it } from 'vitest'
import { createPagesCmsAuth } from '#/server/auth'
import { createLibSqlDatabase } from '#/server/db/client'
import {
  changeAllowlist,
  loadAllowlist,
} from '#/server/admin/sign-in-allowlist'
import { parseAllowlistAction } from '#/shared/requests/admin'
import { emailCanSignIn } from '#/server/auth/sign-in-allowlist'
import { parseAllowlistEmails } from '#/shared/sign-in-allowlist'
import { changeSignInAllowlist } from '#/server/services/admin'
import type { RequestServices } from '#/server/context'
import type { ServiceUser } from '#/server/services/context'

const secret = 'test-allowlist-secret-with-at-least-32-characters'

it('normalizes pasted mailboxes and rejects invalid or oversized imports', () => {
  expect(
    parseAllowlistEmails(
      '"Doe, Jane" <Jane@Example.com>; john@example.com\nJANE@example.com',
    ),
  ).toEqual(['jane@example.com', 'john@example.com'])
  expect(() => parseAllowlistEmails('jane@example.com; invalid')).toThrow(
    'Invalid email list',
  )
  expect(() => parseAllowlistEmails('a'.repeat(20_001))).toThrow(
    'Email list is too long',
  )
})

it('normalizes, imports, searches, paginates and removes rules', async () => {
  const client = createClient({ url: 'file::memory:' })
  const db = createLibSqlDatabase(client)
  try {
    await migrate(db, { migrationsFolder: './drizzle' })
    expect(await emailCanSignIn(db, 'any@example.test')).toBe(true)
    await changeAllowlist(
      db,
      parseAllowlistAction({
        action: 'add',
        type: 'domain',
        value: '@Example.COM',
      }),
    )
    await changeAllowlist(
      db,
      parseAllowlistAction({
        action: 'add',
        type: 'domain',
        value: 'example.com',
      }),
    )
    await changeAllowlist(
      db,
      parseAllowlistAction({
        action: 'add',
        type: 'pattern',
        value: '.*@other\\.test',
      }),
    )
    await changeAllowlist(
      db,
      parseAllowlistAction({
        action: 'import',
        emails: Array.from(
          { length: 21 },
          (_, i) => `User${i}@test.invalid`,
        ).join(', '),
      }),
    )
    expect(await emailCanSignIn(db, 'person@example.com')).toBe(true)
    expect(await emailCanSignIn(db, 'X@OTHER.TEST')).toBe(true)
    expect(await emailCanSignIn(db, 'person@unrelated.test')).toBe(false)
    expect((await loadAllowlist(db, { query: '', page: 1 })).total).toBe(23)
    expect(
      (await loadAllowlist(db, { query: '', page: 2 })).rules,
    ).toHaveLength(3)
    expect((await loadAllowlist(db, { query: '%', page: 1 })).total).toBe(0)
    const match = await loadAllowlist(db, { query: 'example.com', page: 1 })
    expect(match.rules).toMatchObject([
      { type: 'domain', value: 'example.com' },
    ])
    await changeAllowlist(
      db,
      parseAllowlistAction({ action: 'remove', id: match.rules[0].id }),
    )
    expect(await emailCanSignIn(db, 'person@example.com')).toBe(false)
    expect(() =>
      parseAllowlistAction({ action: 'add', type: 'pattern', value: '(a+)+$' }),
    ).toThrow()
    expect(() =>
      parseAllowlistAction({ action: 'add', type: 'pattern', value: '[' }),
    ).toThrow()
  } finally {
    client.close()
  }
})

it('restricts email and OAuth sign-in and future sessions without revoking existing sessions', async () => {
  const client = createClient({ url: 'file::memory:' })
  const db = createLibSqlDatabase(client)
  try {
    await migrate(db, { migrationsFolder: './drizzle' })
    let code = ''
    const auth = createPagesCmsAuth({
      database: db,
      configuration: { baseUrl: 'https://cms.test', secret },
      emailProvider: {
        send: async (message) => {
          code = message.subject.match(/\d{6}/)?.[0] ?? ''
        },
      },
    })
    const post = (path: string, email: string, otp?: string) =>
      auth.handler(
        new Request(`https://cms.test/api/auth/${path}`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            origin: 'https://cms.test',
          },
          body: JSON.stringify(
            otp ? { email, otp } : { email, type: 'sign-in' },
          ),
        }),
      )
    expect(
      (await post('email-otp/send-verification-otp', 'person@example.test'))
        .status,
    ).toBe(200)
    const signedIn = await post(
      'sign-in/email-otp',
      'person@example.test',
      code,
    )
    expect(signedIn.status).toBe(200)
    const cookie = signedIn.headers
      .getSetCookie()
      .map((v) => v.split(';')[0])
      .join('; ')
    expect(
      (await post('email-otp/send-verification-otp', 'person@example.test'))
        .status,
    ).toBe(200)
    const pendingCode = code
    await changeAllowlist(
      db,
      parseAllowlistAction({
        action: 'add',
        type: 'email',
        value: 'other@example.test',
      }),
    )
    expect(
      (await post('email-otp/send-verification-otp', 'person@example.test'))
        .status,
    ).toBe(403)
    expect(
      (await post('sign-in/email-otp', 'person@example.test', pendingCode)).ok,
    ).toBe(false)
    expect(
      await auth.api.getSession({
        headers: new Headers({ cookie }),
        query: { disableCookieCache: true },
      }),
    ).not.toBeNull()
    const validate = auth.options.user.validateUserInfo
    for (const providerId of ['github', 'google']) {
      const result = await validate({
        user: { email: 'person@example.test', emailVerified: true },
        source: { method: 'oauth', action: 'sign-in', oauth: { providerId } },
      })
      expect(result).toMatchObject({ error: 'access_denied' })
    }
  } finally {
    client.close()
  }
})

it('rejects allowlist changes by non-admins', async () => {
  const services = {
    configuration: {
      adminEmails: ['admin@example.test'],
      auth: { baseUrl: 'https://cms.test' },
    },
    access: { authorize: async () => undefined },
  } as unknown as RequestServices
  const user = {
    id: 'u',
    email: 'user@example.test',
    name: 'User',
    emailVerified: true,
    githubUsername: null,
  } satisfies ServiceUser
  await expect(
    changeSignInAllowlist(
      services,
      user,
      parseAllowlistAction({
        action: 'add',
        type: 'email',
        value: 'user@example.test',
      }),
    ),
  ).rejects.toThrow('Admin access required')
})

it('applies and reads rules against a D1 database', async () => {
  const { readdir, readFile } = await import('node:fs/promises')
  const { Miniflare } = await import('miniflare')
  const { createD1Database } = await import('#/server/db/client')
  const worker = new Miniflare({
    modules: true,
    script: 'export default {fetch(){return new Response("ok")}}',
    compatibilityDate: '2026-07-30',
    d1Databases: { DATABASE: 'allowlist-test' },
  })
  try {
    const binding = await worker.getD1Database('DATABASE')
    const files = (await readdir('drizzle'))
      .filter((file) => file.endsWith('.sql'))
      .sort()
    for (const file of files) {
      const migration = await readFile(`drizzle/${file}`, 'utf8')
      await binding.batch(
        migration
          .split('--> statement-breakpoint')
          .filter((sql) => sql.trim())
          .map((sql) => binding.prepare(sql.trim())),
      )
    }
    const db = createD1Database(binding)
    await changeAllowlist(
      db,
      parseAllowlistAction({
        action: 'import',
        emails: 'one@example.com two@example.com',
      }),
    )
    expect((await loadAllowlist(db, { query: 'one', page: 1 })).total).toBe(1)
    expect(await emailCanSignIn(db, 'one@example.com')).toBe(true)
    expect(await emailCanSignIn(db, 'three@example.com')).toBe(false)
  } finally {
    await worker.dispose()
  }
})

it('does not create an account if its email becomes disallowed after a code is sent', async () => {
  const client = createClient({ url: 'file::memory:' })
  const db = createLibSqlDatabase(client)
  try {
    await migrate(db, { migrationsFolder: './drizzle' })
    let code = ''
    const auth = createPagesCmsAuth({
      database: db,
      configuration: { baseUrl: 'https://cms.test', secret },
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
          email: 'new@example.test',
          type: 'sign-in',
        })
      ).status,
    ).toBe(200)
    await changeAllowlist(
      db,
      parseAllowlistAction({
        action: 'add',
        type: 'domain',
        value: 'allowed.test',
      }),
    )
    expect(
      (
        await post('sign-in/email-otp', {
          email: 'new@example.test',
          otp: code,
        })
      ).ok,
    ).toBe(false)
    expect((await client.execute('SELECT id FROM user')).rows).toHaveLength(0)
  } finally {
    client.close()
  }
})
