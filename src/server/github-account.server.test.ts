import { sql } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'

import { createDatabase } from './database/client.server'
import { accountTable, userTable } from './database/schema'
import { syncGitHubProfile } from './github-account.server'

async function createAuthDatabase() {
  const database = createDatabase({ url: 'file::memory:' })
  await database.run(sql`
    create table user (
      id text primary key,
      name text not null,
      image text,
      github_username text,
      email text not null unique,
      email_verified integer not null default 0,
      created_at integer not null,
      updated_at integer not null
    )
  `)
  await database.run(sql`
    create table account (
      id text primary key,
      account_id text not null,
      issuer text not null,
      provider_id text not null,
      user_id text not null,
      access_token text,
      refresh_token text,
      id_token text,
      access_token_expires_at integer,
      refresh_token_expires_at integer,
      scope text,
      password text,
      created_at integer not null,
      updated_at integer not null
    )
  `)
  const now = new Date('2026-09-26T00:00:00Z')
  await database.insert(userTable).values({
    id: 'user-1',
    name: 'old-login',
    email: 'user@example.com',
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
  })
  await database.insert(accountTable).values({
    id: 'account-1',
    accountId: '123',
    issuer: 'github',
    providerId: 'github',
    userId: 'user-1',
    accessToken: 'github-token',
    createdAt: now,
    updatedAt: now,
  })
  return database
}

describe('syncGitHubProfile', () => {
  it('repairs GitHub identity after sign-in without exposing the token', async () => {
    const database = await createAuthDatabase()
    const fetcher = vi.fn(
      async (_url: string | URL | Request, init?: RequestInit) => {
        expect(new Headers(init?.headers).get('authorization')).toBe(
          'Bearer github-token',
        )
        return Response.json({
          login: 'new-login',
          name: 'GitHub Name',
          avatar_url: 'https://avatars.example/user',
        })
      },
    ) as typeof fetch

    await expect(
      syncGitHubProfile(database, 'user-1', fetcher),
    ).resolves.toEqual({
      githubUsername: 'new-login',
      image: 'https://avatars.example/user',
      name: 'old-login',
    })
    await expect(
      database.query.userTable.findFirst({
        where: (table, { eq }) => eq(table.id, 'user-1'),
      }),
    ).resolves.toMatchObject({
      githubUsername: 'new-login',
      image: 'https://avatars.example/user',
      name: 'old-login',
    })
  })

  it('does nothing when the user has no linked GitHub token', async () => {
    const database = await createAuthDatabase()
    await database.update(accountTable).set({ accessToken: null })
    const fetcher = vi.fn()

    await expect(
      syncGitHubProfile(database, 'user-1', fetcher),
    ).resolves.toBeNull()
    expect(fetcher).not.toHaveBeenCalled()
  })
})
