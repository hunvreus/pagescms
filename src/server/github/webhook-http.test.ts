import { createHmac, generateKeyPairSync } from 'node:crypto'
import { createClient } from '@libsql/client'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { afterEach, expect, it, vi } from 'vitest'
import { createLibSqlDatabase } from '#/server/db/client'
import {
  findRepositoryIdentity,
  observeRepositoryIdentity,
} from '#/server/access/repository-identity'

afterEach(() => vi.unstubAllGlobals())

it('verifies a signed account rename using the current installation account', async () => {
  const client = createClient({ url: 'file::memory:' })
  try {
    const database = createLibSqlDatabase(client)
    await migrate(database, { migrationsFolder: './drizzle' })
    const repository = { id: 42, ownerId: 99, owner: 'old-owner', repo: 'site' }
    await observeRepositoryIdentity(database, repository)
    const privateKey = generateKeyPairSync('rsa', { modulusLength: 2048 })
      .privateKey.export({ type: 'pkcs8', format: 'pem' })
      .toString()
    const fetcher = vi.fn(async () =>
      Response.json({ id: 17, account: { id: 99, login: 'new-owner' } }),
    )
    vi.stubGlobal('fetch', fetcher)
    const body = JSON.stringify({
      action: 'renamed',
      account: { id: 99, login: 'new-owner' },
      changes: { login: { from: 'old-owner' } },
      installation: { id: 17 },
    })
    const signature = `sha256=${createHmac('sha256', 'test-webhook-secret').update(body).digest('hex')}`
    const { githubWebhookResponse } =
      await import('#/server/github/webhook-response')
    const request = new Request('https://cms.example.test/api/webhook/github', {
      method: 'POST',
      body,
      headers: {
        'x-hub-signature-256': signature,
        'x-github-event': 'installation_target',
      },
    })
    const context = {
      getServices: () => ({
        database,
        cacheDatabase: database,
        configuration: {
          githubWebhookSecret: 'test-webhook-secret',
          githubApp: { appId: '123', privateKey },
        },
        repositoryAccess: {
          forInstallation: async () => {
            throw new Error('repository probe must not run')
          },
        },
      }),
    }
    const invalid = await githubWebhookResponse(
      new Request('https://cms.example.test/api/webhook/github', {
        method: 'POST',
        body,
        headers: {
          'x-hub-signature-256': 'sha256=invalid',
          'x-github-event': 'installation_target',
        },
      }),
      context.getServices() as never,
    )
    expect(invalid.status).toBe(401)
    expect(fetcher).not.toHaveBeenCalled()
    const response = await githubWebhookResponse(
      request,
      context.getServices() as never,
    )
    expect(response.status).toBe(200)
    expect(fetcher).toHaveBeenCalledOnce()
    expect(
      (
        await findRepositoryIdentity(database, {
          owner: 'new-owner',
          repo: 'site',
        })
      )?.externalId,
    ).toBe('42')
  } finally {
    client.close()
  }
})
