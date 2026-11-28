import { createClient } from '@libsql/client'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { expect, it, vi } from 'vitest'
import {
  decryptOAuthToken,
  isPagesCmsToken,
} from '#/server/auth/oauth-token-crypto'
import { createPagesCmsAuth } from '#/server/auth/index'
import { createLibSqlDatabase } from '#/server/db/client'
import { accountTable, userTable } from '#/server/db/schema'
import { createGitHubAccountReader } from '#/server/auth/oauth-account'

const secret = 'test-oauth-token-encryption-secret-at-least-32'

it('chooses the oldest linked GitHub account consistently', async () => {
  const client = createClient({ url: 'file::memory:' })
  try {
    const database = createLibSqlDatabase(client)
    await migrate(database, { migrationsFolder: './drizzle' })
    await database.insert(userTable).values({
      id: 'u',
      name: 'User',
      email: 'user@example.test',
      emailVerified: true,
    })
    await database.insert(accountTable).values([
      {
        id: 'z-old',
        accountId: 'old',
        userId: 'u',
        providerId: 'github',
        createdAt: new Date('2025-01-01'),
      },
      {
        id: 'a-new',
        accountId: 'new',
        userId: 'u',
        providerId: 'github',
        createdAt: new Date('2026-01-01'),
      },
    ])
    const read = createGitHubAccountReader(database, secret)
    expect(await read('u')).toEqual({ id: 'z-old', accessToken: null })
  } finally {
    client.close()
  }
})

it('rejects stored tokens that are not in the Pages CMS format', async () => {
  const client = createClient({ url: 'file::memory:' })
  try {
    const database = createLibSqlDatabase(client)
    await migrate(database, { migrationsFolder: './drizzle' })
    const auth = createPagesCmsAuth({
      database,
      configuration: { baseUrl: 'https://cms.test', secret },
    })
    const context = await auth.$context
    expect(auth.options.account.encryptOAuthTokens).toBe(false)
    await database.insert(userTable).values({
      id: 'u',
      name: 'User',
      email: 'user@example.test',
      emailVerified: true,
    })
    await database.insert(accountTable).values({
      id: 'a',
      accountId: '1',
      userId: 'u',
      providerId: 'github',
      accessToken: 'ghu_unencrypted',
    })
    await expect(
      createGitHubAccountReader(database, secret)('u'),
    ).rejects.toThrow('Reconnect GitHub')
    await expect(
      context.internalAdapter.findAccountByUserId('u'),
    ).rejects.toThrow()
  } finally {
    client.close()
  }
})

it('encrypts newly linked and updated accounts while Better Auth reads plaintext tokens', async () => {
  const client = createClient({ url: 'file::memory:' })
  try {
    const database = createLibSqlDatabase(client)
    await migrate(database, { migrationsFolder: './drizzle' })
    await database.insert(userTable).values({
      id: 'u',
      name: 'User',
      email: 'user@example.test',
      emailVerified: true,
    })
    const auth = createPagesCmsAuth({
      database,
      configuration: { baseUrl: 'https://cms.test', secret },
    })
    const context = await auth.$context
    const account = await context.internalAdapter.createAccount({
      userId: 'u',
      accountId: '1',
      providerId: 'github',
      accessToken: 'ghu_new',
      refreshToken: 'refresh_new',
    })
    const stored = await database.query.accountTable.findFirst()
    expect(isPagesCmsToken(stored!.accessToken!)).toBe(true)
    expect(isPagesCmsToken(stored!.refreshToken!)).toBe(true)
    expect(await createGitHubAccountReader(database, secret)('u')).toEqual({
      id: account.id,
      accessToken: 'ghu_new',
    })
    expect(
      await context.internalAdapter.findAccountByUserId('u'),
    ).toMatchObject([
      {
        accessToken: 'ghu_new',
        refreshToken: 'refresh_new',
      },
    ])
    const transactionAccounts = await context.adapter.transaction(
      (transaction) =>
        transaction.findMany({
          model: 'account',
          where: [{ field: 'userId', value: 'u' }],
        }),
    )
    expect(transactionAccounts).toMatchObject([
      { accessToken: 'ghu_new', refreshToken: 'refresh_new' },
    ])
    await context.internalAdapter.updateAccount(account.id, {
      accessToken: 'ghu_replaced',
    })
    expect(
      await context.internalAdapter.findAccountByUserId('u'),
    ).toMatchObject([
      {
        accessToken: 'ghu_replaced',
        refreshToken: 'refresh_new',
      },
    ])
    const updated = await database.query.accountTable.findFirst()
    expect(isPagesCmsToken(updated!.accessToken!)).toBe(true)
    expect(updated!.accessToken).not.toContain('ghu_replaced')
  } finally {
    client.close()
  }
})

it('serves Better Auth account information using the decrypted OAuth token', async () => {
  const client = createClient({ url: 'file::memory:' })
  try {
    const database = createLibSqlDatabase(client)
    await migrate(database, { migrationsFolder: './drizzle' })
    let code = ''
    const auth = createPagesCmsAuth({
      database,
      configuration: {
        baseUrl: 'https://cms.test',
        secret,
        github: { clientId: 'client', clientSecret: 'client-secret' },
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
          email: 'user@example.test',
          type: 'sign-in',
        })
      ).status,
    ).toBe(200)
    const signIn = await post('sign-in/email-otp', {
      email: 'user@example.test',
      otp: code,
    })
    expect(signIn.status).toBe(200)
    const cookie = signIn.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ')
    const context = await auth.$context
    const [user] = await database.select().from(userTable)
    const linked = await context.internalAdapter.createAccount({
      userId: user.id,
      accountId: 'github-1',
      providerId: 'github',
      accessToken: 'ghu_for_info',
    })
    let expectedAccessToken = 'ghu_for_info'
    const fetcher = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).includes('/login/oauth/access_token')) {
          expect(String(init?.body)).toContain('refresh_token=refresh_for_info')
          return Response.json({
            access_token: 'ghu_refreshed',
            token_type: 'bearer',
            expires_in: 3600,
          })
        }
        expect(new Headers(init?.headers).get('authorization')).toBe(
          `Bearer ${expectedAccessToken}`,
        )
        return String(input).endsWith('/emails')
          ? Response.json([
              { email: 'user@example.test', primary: true, verified: true },
            ])
          : Response.json({
              id: 1,
              login: 'user',
              name: 'User',
              email: 'user@example.test',
              avatar_url: null,
            })
      },
    )
    vi.stubGlobal('fetch', fetcher)
    const response = await auth.handler(
      new Request(
        `https://cms.test/api/auth/account-info?accountId=${linked.id}`,
        {
          headers: { cookie },
        },
      ),
    )
    expect(response.status, JSON.stringify(await response.clone().json())).toBe(
      200,
    )
    expect(await response.json()).toMatchObject({
      account: { providerId: 'github' },
    })
    expect(fetcher).toHaveBeenCalledTimes(2)
    await context.internalAdapter.updateAccount(linked.id, {
      accessTokenExpiresAt: new Date(0),
      refreshToken: 'refresh_for_info',
    })
    expectedAccessToken = 'ghu_refreshed'
    const refreshed = await auth.handler(
      new Request(
        `https://cms.test/api/auth/account-info?accountId=${linked.id}`,
        { headers: { cookie } },
      ),
    )
    expect(
      refreshed.status,
      JSON.stringify(await refreshed.clone().json()),
    ).toBe(200)
    const stored = await database.query.accountTable.findFirst({
      where: (account, { eq }) => eq(account.id, linked.id),
    })
    expect(isPagesCmsToken(stored!.accessToken!)).toBe(true)
    expect(isPagesCmsToken(stored!.refreshToken!)).toBe(true)
    expect(await decryptOAuthToken(stored!.accessToken!, secret)).toBe(
      'ghu_refreshed',
    )
    expect(await decryptOAuthToken(stored!.refreshToken!, secret)).toBe(
      'refresh_for_info',
    )
    expect(fetcher).toHaveBeenCalledTimes(5)
  } finally {
    vi.unstubAllGlobals()
    client.close()
  }
})
