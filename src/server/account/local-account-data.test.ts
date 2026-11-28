import { createClient } from '@libsql/client'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { eq } from 'drizzle-orm'
import { expect, it } from 'vitest'
import { createLibSqlDatabase } from '#/server/db/client'
import { userTable } from '#/server/db/schema'
import {
  deletedLocalAccounts,
  localAccountReceipt,
  receiptAccount,
} from '#/server/services/local-account-data'

const secret = 'local-cleanup-test-secret-at-least-32-characters'

it('binds cleanup receipts to an account, scope and installation secret', async () => {
  const receipt = await localAccountReceipt('account-one', secret)
  expect(await receiptAccount(receipt, secret)).toBe('account-one')
  expect(await receiptAccount(receipt, `${secret}-other`)).toBeUndefined()
  const [, signature] = receipt.split('.')
  expect(
    await receiptAccount(`${btoa('account-two')}.${signature}`, secret),
  ).toBeUndefined()
  for (const malformed of ['', 'account-one', 'a.b.c', '*.*'])
    expect(await receiptAccount(malformed, secret)).toBeUndefined()
})

it('authorizes cleanup only for previously authenticated accounts that no longer exist', async () => {
  const client = createClient({ url: 'file::memory:' })
  try {
    const database = createLibSqlDatabase(client)
    await migrate(database, { migrationsFolder: './drizzle' })
    await database.insert(userTable).values([
      { id: 'one', name: 'One', email: 'one@example.com' },
      { id: 'two', name: 'Two', email: 'two@example.com' },
    ])
    const receipts = await Promise.all(
      ['one', 'two'].map((id) => localAccountReceipt(id, secret)),
    )
    expect(await deletedLocalAccounts(database, secret, receipts)).toEqual([])
    await database.delete(userTable).where(eq(userTable.id, 'one'))
    expect(
      await deletedLocalAccounts(database, secret, [
        ...receipts,
        'forged',
        receipts[0],
      ]),
    ).toEqual(['one'])
    expect(
      await deletedLocalAccounts(database, `${secret}-rotated`, receipts),
    ).toEqual([])
  } finally {
    client.close()
  }
})
