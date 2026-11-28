import { createClient } from '@libsql/client'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { expect, it, vi } from 'vitest'
import { createLibSqlDatabase } from '#/server/db/client'
import { createAccessPolicyGateway } from '#/server/access/policy'
import {
  deleteAccountData,
  deleteCurrentAccount,
  isFreshAccountSession,
} from './deletion'
import {
  accountTable,
  collaboratorInviteTable,
  collaboratorTable,
  repositoryTable,
  sessionTable,
  userTable,
  verificationTable,
} from '#/server/db/schema'

async function fixture() {
  const client = createClient({ url: 'file::memory:' })
  const database = createLibSqlDatabase(client)
  await migrate(database, { migrationsFolder: './drizzle' })
  const now = new Date()
  const user = {
    id: 'deleting',
    name: 'Deleting',
    email: 'delete@example.com',
    emailVerified: true,
    image: null,
    createdAt: now,
    updatedAt: now,
  }
  await database
    .insert(userTable)
    .values([user, { id: 'other', name: 'Other', email: 'other@example.com' }])
  await database.insert(accountTable).values([
    {
      id: 'github',
      userId: user.id,
      accountId: '123',
      providerId: 'github',
    },
    {
      id: 'google',
      userId: 'other',
      accountId: '456',
      providerId: 'google',
    },
  ])
  const session = {
    id: 'session',
    userId: user.id,
    token: 'secret',
    createdAt: now,
    updatedAt: now,
    expiresAt: new Date(Date.now() + 7 * 86400000),
  }
  await database.insert(sessionTable).values(session)
  const membership = {
    type: 'github',
    installationId: 1,
    ownerId: 1,
    repoId: 2,
    owner: 'owner',
    repo: 'repo',
  }
  await database.insert(collaboratorTable).values([
    { ...membership, email: 'DELETE@example.com', userId: user.id },
    { ...membership, email: 'unlinked@example.com', userId: user.id },
    {
      ...membership,
      email: 'other@example.com',
      userId: 'other',
      invitedBy: user.id,
    },
  ])
  await database.insert(collaboratorInviteTable).values({
    email: 'DELETE@example.com',
    token: 'invite',
    repoId: 2,
    owner: 'owner',
    repo: 'repo',
    expiresAt: now,
  })
  await database.insert(verificationTable).values({
    id: 'otp',
    identifier: 'sign-in-otp-delete@example.com',
    value: '123456',
    expiresAt: now,
  })
  await database.insert(repositoryTable).values({
    source: 'github.com',
    owner: 'owner',
    repo: 'repo',
    lastOpenedAt: now,
  })
  const services = {
    database,
    access: createAccessPolicyGateway({ required: false }),
    getSession: vi.fn(async () => ({ user, session })),
    beforeAccountDelete: undefined,
  }
  return { client, database, services, user, session }
}

it('deletes only the current account, revokes all sessions and memberships, and preserves other collaborators and repositories', async () => {
  const { client, database, services, user } = await fixture()
  try {
    expect(
      await deleteCurrentAccount(services, {
        accountId: user.id,
        email: user.email,
      }),
    ).toEqual({ status: 'deleted' })
    expect(
      (await database.select().from(userTable)).map((row) => row.id),
    ).toEqual(['other'])
    expect(
      (await database.select().from(accountTable)).map((row) => row.id),
    ).toEqual(['google'])
    expect(await database.select().from(sessionTable)).toEqual([])
    expect(await database.select().from(collaboratorInviteTable)).toEqual([])
    expect(await database.select().from(verificationTable)).toEqual([])
    expect(await database.select().from(collaboratorTable)).toMatchObject([
      { email: 'other@example.com', userId: 'other', invitedBy: null },
    ])
    expect(await database.select().from(repositoryTable)).toHaveLength(1)
  } finally {
    client.close()
  }
})

it('rolls back all cleanup when any deletion statement fails', async () => {
  const { client, database, user } = await fixture()
  try {
    await client.execute(
      "CREATE TRIGGER reject_deletion BEFORE DELETE ON user BEGIN SELECT RAISE(ABORT, 'blocked'); END",
    )
    await expect(deleteAccountData(database, user)).rejects.toThrow('blocked')
    expect(await database.select().from(userTable)).toHaveLength(2)
    expect(await database.select().from(sessionTable)).toHaveLength(1)
    expect(await database.select().from(accountTable)).toHaveLength(2)
    expect(await database.select().from(collaboratorTable)).toHaveLength(3)
    expect(await database.select().from(collaboratorInviteTable)).toHaveLength(
      1,
    )
  } finally {
    client.close()
  }
})

it('rejects another account, mismatched confirmation, guests and denied policy without deleting data', async () => {
  const { client, database, services, user } = await fixture()
  try {
    await expect(
      deleteCurrentAccount(services, { accountId: 'other', email: user.email }),
    ).rejects.toThrow('account changed')
    await expect(
      deleteCurrentAccount(services, {
        accountId: user.id,
        email: 'other@example.com',
      }),
    ).rejects.toThrow('confirm deletion')
    await expect(
      deleteCurrentAccount(
        { ...services, getSession: async () => null },
        { accountId: user.id, email: user.email },
      ),
    ).rejects.toThrow('Authentication required')
    await expect(
      deleteCurrentAccount(
        {
          ...services,
          access: createAccessPolicyGateway({
            required: true,
            policy: {
              authorize: async () => ({
                allowed: false,
                reason: 'permission_denied',
              }),
            },
          }),
        },
        { accountId: user.id, email: user.email },
      ),
    ).rejects.toThrow('permission_denied')
    expect(await database.select().from(userTable)).toHaveLength(2)
    expect(await database.select().from(sessionTable)).toHaveLength(1)
  } finally {
    client.close()
  }
})

it('requires a fresh session and runs extension checks before deleting data', async () => {
  const { client, database, services, session, user } = await fixture()
  const request = { accountId: user.id, email: user.email }
  try {
    expect(
      await deleteCurrentAccount(
        {
          ...services,
          getSession: async () => ({
            user,
            session: { ...session, createdAt: new Date(Date.now() - 86400000) },
          }),
        },
        request,
      ),
    ).toEqual({ status: 'reauthentication-required' })
    const beforeAccountDelete = vi.fn(async () => {
      throw new Error('An external resource still exists')
    })
    await expect(
      deleteCurrentAccount({ ...services, beforeAccountDelete }, request),
    ).rejects.toThrow('An external resource still exists')
    expect(beforeAccountDelete).toHaveBeenCalledWith({ accountId: user.id })
    expect(await database.select().from(userTable)).toHaveLength(2)
    expect(await deleteCurrentAccount(services, request)).toEqual({
      status: 'deleted',
    })
  } finally {
    client.close()
  }
})

it('rejects expired, invalid and future-dated session creation times', () => {
  const now = Date.now()
  expect(isFreshAccountSession(new Date(now - 1000), now)).toBe(true)
  for (const timestamp of [now - 86400000, now + 1000, NaN])
    expect(isFreshAccountSession(new Date(timestamp), now)).toBe(false)
})
