import { createClient } from '@libsql/client'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { expect, it } from 'vitest'
import { createLibSqlDatabase } from '#/server/db/client'
import { userTable } from '#/server/db/schema'
import { loadServiceUser } from '#/server/services/context'
import {
  deletedLocalAccounts,
  localAccountReceipt,
} from '#/server/services/local-account-data'
import {
  readAccountPreferences,
  updateAccountLanguage,
  updateAccountPreferences,
} from './preferences'
import {
  parsePreferencesUpdate,
  resolveEditingPreferences,
} from '#/shared/account-preferences'

it('validates known preference keys and values', () => {
  expect(
    parsePreferencesUpdate({
      accountId: 'one',
      editing: { newTranslations: 'copy' },
    }),
  ).toEqual({ accountId: 'one', editing: { newTranslations: 'copy' } })
  for (const value of [
    null,
    {},
    { accountId: 'one', editing: {} },
    { accountId: 'one', editing: { newTranslations: 'invalid' } },
    { accountId: 'one', editing: { newsletter: true } },
    { accountId: 'one', editing: { newTranslations: 'blank' }, userId: 'two' },
  ])
    expect(() => parsePreferencesUpdate(value)).toThrow()
  expect(resolveEditingPreferences()).toEqual({
    newTranslations: 'ask',
  })
})
it('persists preferences across database clients and preserves independent concurrent changes', async () => {
  const client = createClient({ url: 'file::memory:' })
  try {
    const db = createLibSqlDatabase(client)
    await migrate(db, { migrationsFolder: './drizzle' })
    await db.insert(userTable).values([
      { id: 'one', name: 'One', email: 'one@example.com' },
      { id: 'two', name: 'Two', email: 'two@example.com' },
    ])
    expect(await loadServiceUser(db, 'one')).toEqual({
      id: 'one',
      name: 'One',
      email: 'one@example.com',
      emailVerified: false,
      image: null,
      githubUsername: null,
    })
    expect(await loadServiceUser(db, 'missing')).toBeNull()
    await Promise.all([
      updateAccountLanguage(db, 'one', 'fr'),
      updateAccountPreferences(db, 'one', { newTranslations: 'copy' }),
    ])
    expect(
      await readAccountPreferences(createLibSqlDatabase(client), 'one'),
    ).toEqual({
      language: 'fr',
      editing: { newTranslations: 'copy' },
    })
    expect(await readAccountPreferences(db, 'two')).toEqual({})
    await expect(
      updateAccountPreferences(db, 'missing', { newTranslations: 'blank' }),
    ).rejects.toThrow('Account not found')
    expect(
      (await client.execute('PRAGMA table_info(user)')).rows.map(
        (row) => row.name,
      ),
    ).not.toContain('product_updates_opted_in_at')
  } finally {
    client.close()
  }
})

it('creates nested JSON preferences and preserves partial writes on D1', async () => {
  const { Miniflare } = await import('miniflare')
  const { createD1Database } = await import('#/server/db/client')
  const mf = new Miniflare({
    modules: true,
    script: 'export default {fetch(){return new Response("ok")}}',
    compatibilityDate: '2026-07-30',
    d1Databases: { DATABASE: 'core' },
  })
  try {
    const binding = await mf.getD1Database('DATABASE')
    await binding
      .prepare(
        "CREATE TABLE user (id text PRIMARY KEY,preferences text NOT NULL DEFAULT '{}',updated_at integer)",
      )
      .run()
    await binding.prepare("INSERT INTO user(id) VALUES ('one')").run()
    const db = createD1Database(binding)
    const receipts = await Promise.all(
      ['one', 'missing'].map((id) => localAccountReceipt(id, 'secret')),
    )
    expect(await deletedLocalAccounts(db, 'secret', receipts)).toEqual([
      'missing',
    ])
    await updateAccountLanguage(db, 'one', 'fr')
    await updateAccountPreferences(db, 'one', { newTranslations: 'blank' })
    expect(await readAccountPreferences(db, 'one')).toEqual({
      language: 'fr',
      editing: { newTranslations: 'blank' },
    })
  } finally {
    await mf.dispose()
  }
})
