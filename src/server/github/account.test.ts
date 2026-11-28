import { createClient } from '@libsql/client'
import type { Client } from '@libsql/client'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createLibSqlDatabase } from '#/server/db/client'
import { accountTable, userTable } from '#/server/db/schema'
import { syncGitHubProfile } from '#/server/github/account'
import { updateAccountProfile } from '#/server/account/account'

const clients: Client[] = []
afterEach(() => {
  clients.forEach((client) => client.close())
  clients.length = 0
})

async function createAuthDatabase() {
  const client = createClient({ url: 'file::memory:' })
  clients.push(client)
  const database = createLibSqlDatabase(client)
  await migrate(database, { migrationsFolder: './drizzle' })
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
      syncGitHubProfile(database, 'user-1', 'github-token', fetcher),
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
      syncGitHubProfile(database, 'user-1', null, fetcher),
    ).resolves.toBeNull()
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('keeps profile confirmation completed while the GitHub request was pending', async () => {
    const database = await createAuthDatabase()
    const fetcher = vi.fn(async () => {
      await updateAccountProfile(database, 'user-1', {
        name: 'Confirmed while waiting',
        image: null,
      })
      return Response.json({
        login: 'new-login',
        name: 'Provider name',
        avatar_url: 'https://avatars.example/new',
      })
    }) as typeof fetch
    await expect(
      syncGitHubProfile(database, 'user-1', 'github-token', fetcher),
    ).resolves.toEqual({
      githubUsername: 'new-login',
      name: 'Confirmed while waiting',
      image: null,
    })
    expect(await database.query.userTable.findFirst()).toMatchObject({
      name: 'Confirmed while waiting',
      image: null,
    })
    expect(fetcher).toHaveBeenCalledOnce()
  })
  it.each([null, 'data:image/webp;base64,cGljdHVyZQ=='])(
    'keeps confirmed names and picture choices (%s) on later sign-ins',
    async (image) => {
      const database = await createAuthDatabase()
      await database.update(userTable).set({
        name: 'My chosen name',
        image,
        onboardingCompletedAt: new Date(),
      })
      const fetcher = vi.fn(async () =>
        Response.json({
          login: 'new-login',
          name: 'Provider name',
          avatar_url: 'https://avatars.example/new',
        }),
      ) as typeof fetch
      await expect(
        syncGitHubProfile(database, 'user-1', 'github-token', fetcher),
      ).resolves.toMatchObject({
        githubUsername: 'new-login',
        name: 'My chosen name',
        image,
      })
      expect(await database.query.userTable.findFirst()).toMatchObject({
        name: 'My chosen name',
        image,
      })
    },
  )
})

it('updates an unconfirmed GitHub profile on D1', async () => {
  const { Miniflare } = await import('miniflare')
  const { createD1Database } = await import('#/server/db/client')
  const worker = new Miniflare({
    modules: true,
    script: 'export default {fetch(){return new Response("ok")}}',
    compatibilityDate: '2026-07-30',
    d1Databases: { DATABASE: 'profile' },
  })
  try {
    const binding = await worker.getD1Database('DATABASE')
    await binding.batch([
      binding.prepare(
        'CREATE TABLE user (id text PRIMARY KEY, name text NOT NULL, image text, github_username text, onboarding_completed_at integer, updated_at integer)',
      ),
      binding.prepare("INSERT INTO user(id, name) VALUES ('u', '')"),
    ])
    const result = await syncGitHubProfile(
      createD1Database(binding),
      'u',
      'token',
      vi.fn(async () =>
        Response.json({ login: 'editor', name: 'Editor', avatar_url: null }),
      ),
    )
    expect(result).toEqual({
      githubUsername: 'editor',
      name: 'Editor',
      image: null,
    })
  } finally {
    await worker.dispose()
  }
})
