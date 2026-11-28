import { readFile, readdir } from 'node:fs/promises'
import { createClient } from '@libsql/client'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { expect, it } from 'vitest'
import { createLibSqlDatabase } from '#/server/db/client'
import { consumeLoginEmail } from '#/server/auth/rate-limit'
import { createPagesCmsAuth } from '#/server/auth/index'

it('atomically limits concurrent sign-in emails across service instances and expires the window', async () => {
  const client = createClient({ url: 'file::memory:' })
  const database = createLibSqlDatabase(client)
  try {
    await migrate(database, { migrationsFolder: './drizzle' })
    const now = 1_000_000
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, (_, index) =>
        consumeLoginEmail(
          database,
          index % 2 ? 'PERSON@example.com' : 'person@example.com',
          'secret',
          now,
        ),
      ),
    )
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(3)
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(9)
    await consumeLoginEmail(database, 'other@example.com', 'secret', now)
    await consumeLoginEmail(
      database,
      'person@example.com',
      'secret',
      now + 600_000,
    )
    const rows = await client.execute('SELECT key,count FROM auth_email_rate')
    expect(JSON.stringify(rows.rows)).not.toContain('example.com')
  } finally {
    client.close()
  }
})

it.each([undefined, 'cf-connecting-ip'])(
  'shares the authentication endpoint IP limit across instances (%s)',
  async (clientIpHeader) => {
    const client = createClient({ url: 'file::memory:' })
    const database = createLibSqlDatabase(client)
    try {
      await migrate(database, { migrationsFolder: './drizzle' })
      let deliveries = 0
      const send = (index: number) =>
        createPagesCmsAuth({
          database,
          configuration: {
            baseUrl: 'https://cms.test',
            clientIpHeader,
            secret: 'fixture-auth-secret-with-at-least-32-characters',
          },
          emailProvider: {
            send: async (message) => {
              expect(message.subject).toMatch(/\b\d{6}\b/)
              expect(message.html).toContain('lang="fr"')
              deliveries++
            },
          },
        }).handler(
          new Request(
            'https://cms.test/api/auth/email-otp/send-verification-otp',
            {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
                origin: 'https://cms.test',
                'accept-language': 'fr-FR',
                'x-forwarded-for': clientIpHeader
                  ? `192.0.2.${index + 1}`
                  : '192.0.2.42',
                ...(clientIpHeader ? { [clientIpHeader]: '192.0.2.42' } : {}),
              },
              body: JSON.stringify({
                email: `fixture${index}@example.test`,
                type: 'sign-in',
              }),
            },
          ),
        )
      for (let index = 0; index < 3; index++)
        expect((await send(index)).status).toBe(200)
      expect((await send(3)).status).toBe(429)
      expect(deliveries).toBe(3)
    } finally {
      client.close()
    }
  },
)

it('enforces the recipient limit with atomic D1 batches', async () => {
  const { Miniflare } = await import('miniflare')
  const { createD1Database } = await import('#/server/db/client')
  const worker = new Miniflare({
    modules: true,
    script: 'export default {fetch(){return new Response("ok")}}',
    compatibilityDate: '2026-07-30',
    d1Databases: { DATABASE: 'auth-limits' },
  })
  try {
    const binding = await worker.getD1Database('DATABASE')
    const files = (await readdir('drizzle'))
      .filter((file) => file.endsWith('.sql'))
      .sort()
    const migration = (
      await Promise.all(
        files.map((file) => readFile(`drizzle/${file}`, 'utf8')),
      )
    ).join('\n--> statement-breakpoint\n')
    await binding.batch(
      migration
        .split('--> statement-breakpoint')
        .filter((sql) => sql.trim())
        .map((sql) => binding.prepare(sql.trim())),
    )
    const database = createD1Database(binding)
    const attempts = await Promise.allSettled(
      Array.from({ length: 8 }, () =>
        consumeLoginEmail(
          database,
          'recipient@example.test',
          'secret',
          1_000_000,
        ),
      ),
    )
    expect(
      attempts.filter((attempt) => attempt.status === 'fulfilled'),
    ).toHaveLength(3)
  } finally {
    await worker.dispose()
  }
})

it('blocks another send before replacing an expired code and disables unused credential endpoints', async () => {
  const client = createClient({ url: 'file::memory:' })
  const database = createLibSqlDatabase(client)
  try {
    await migrate(database, { migrationsFolder: './drizzle' })
    let deliveries = 0
    const auth = createPagesCmsAuth({
      database,
      configuration: {
        baseUrl: 'https://cms.test',
        secret: 'fixture-auth-secret-with-at-least-32-characters',
      },
      emailProvider: {
        send: async () => {
          deliveries++
        },
      },
    })
    const post = (path: string, index: number) =>
      auth.handler(
        new Request(`https://cms.test/api/auth${path}`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            origin: 'https://cms.test',
            'x-forwarded-for': `192.0.2.${index}`,
          },
          body: JSON.stringify({
            email:
              index % 2 === 0 ? '\u212Aate@example.test' : 'kate@example.test',
            type: 'sign-in',
          }),
        }),
      )
    const send = '/email-otp/send-verification-otp'
    for (let index = 1; index <= 3; index++)
      expect((await post(send, index)).status).toBe(200)
    await client.execute('UPDATE verification SET expires_at = 1')
    const before = (await client.execute('SELECT * FROM verification')).rows
    expect(before).toHaveLength(1)
    expect((await post(send, 4)).status).toBe(429)
    expect((await client.execute('SELECT * FROM verification')).rows).toEqual(
      before,
    )
    expect(deliveries).toBe(3)
    for (const path of [
      '/email-otp/check-verification-otp',
      '/get-access-token',
      '/refresh-token',
    ])
      expect((await post(path, 5)).status).toBe(404)
  } finally {
    client.close()
  }
})
