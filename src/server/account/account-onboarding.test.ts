import { createClient } from '@libsql/client'
import { eq } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { expect, it } from 'vitest'
import { createLibSqlDatabase } from '#/server/db/client'
import { userTable } from '#/server/db/schema'
import { updateAccountProfile } from './account'

it('confirms name and optional picture atomically for the signed-in account only', async () => {
  const client = createClient({ url: 'file::memory:' })
  try {
    const database = createLibSqlDatabase(client)
    await migrate(database, { migrationsFolder: './drizzle' })
    await database.insert(userTable).values([
      { id: 'first', name: 'First', email: 'first@example.com' },
      { id: 'second', name: 'Second', email: 'second@example.com' },
    ])
    const startedAt = Date.now()
    expect(
      await updateAccountProfile(database, 'first', {
        name: 'Confirmed name',
        image: null,
      }),
    ).toEqual({ name: 'Confirmed name', image: null })
    const reopened = createLibSqlDatabase(client)
    const first = await reopened.query.userTable.findFirst({
      where: (table) => eq(table.id, 'first'),
    })
    expect(first?.onboardingCompletedAt).toBeInstanceOf(Date)
    const raw = await client.execute(
      "select onboarding_completed_at from user where id = 'first'",
    )
    const timestamp = Number(raw.rows[0].onboarding_completed_at)
    expect(timestamp).toBe(first?.onboardingCompletedAt?.getTime())
    expect(timestamp).toBeGreaterThanOrEqual(startedAt)
    expect(timestamp).toBeLessThanOrEqual(Date.now())
    expect(first?.name).toBe('Confirmed name')
    const second = await reopened.query.userTable.findFirst({
      where: (table) => eq(table.id, 'second'),
    })
    expect(second?.onboardingCompletedAt).toBeNull()
    await updateAccountProfile(database, 'second', { name: 'Edited name' })
    expect(
      (
        await reopened.query.userTable.findFirst({
          where: (table) => eq(table.id, 'second'),
        })
      )?.onboardingCompletedAt,
    ).toBeInstanceOf(Date)
    const completed = new Date('2026-01-01T00:00:00Z')
    await database
      .update(userTable)
      .set({ onboardingCompletedAt: completed })
      .where(eq(userTable.id, 'first'))
    await updateAccountProfile(database, 'first', {
      name: 'Updated again',
      image: null,
    })
    expect(
      (
        await reopened.query.userTable.findFirst({
          where: (table) => eq(table.id, 'first'),
        })
      )?.onboardingCompletedAt?.getTime(),
    ).toBe(completed.getTime())
    await expect(
      updateAccountProfile(database, 'missing', { name: 'Missing' }),
    ).rejects.toThrow('Account not found')
  } finally {
    client.close()
  }
})
