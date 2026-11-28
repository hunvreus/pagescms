import { createClient } from '@libsql/client'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { expect, it, vi } from 'vitest'
import { createLibSqlDatabase } from '#/server/db/client'
import { observeRepositoryIdentity } from '#/server/access/repository-identity'
import { withRepositoryPolicyIdentity } from '#/server/access/repository-identity-policy'
import { withActivityCapture } from '#/server/activity/capture'
import { createAccessPolicyGateway } from '#/server/access/policy'
import type { AccessPolicy, AccessRequest } from '#/server/access/policy'

it('preserves identity validation through the activity wrapper and reuses the admitted identity for each batch', async () => {
  const client = createClient({ url: 'file::memory:' })
  try {
    const database = createLibSqlDatabase(client)
    await migrate(database, { migrationsFolder: './drizzle' })
    await observeRepositoryIdentity(database, {
      id: '42',
      owner: 'o',
      repo: 'r',
      ownerId: '7',
    })
    const authorizeMany = vi.fn<NonNullable<AccessPolicy['authorizeMany']>>(
      async (requests) => requests.map(() => ({ allowed: true })),
    )
    const access = withActivityCapture(
      withRepositoryPolicyIdentity(
        createAccessPolicyGateway({
          policy: { authorize: async () => ({ allowed: true }), authorizeMany },
        }),
        database,
        true,
      ),
      database,
      database,
    )
    const request: AccessRequest = {
      operation: 'media.read',
      principal: {
        type: 'collaborator',
        id: 'u',
        membershipId: '1',
        repositoryIdentity: {
          source: 'github.com',
          externalId: '42',
          ownerId: '7',
        },
      },
      tenant: { type: 'repository', id: 'o/r' },
      target: {
        repository: { owner: 'o', repo: 'r', repoId: '42' },
        branch: 'main',
        media: 'images',
      },
    }
    const select = vi.spyOn(database, 'select')
    await access.authorizeMany(
      Array.from({ length: 100 }, (_, i) => ({
        ...request,
        target: { ...request.target, path: `images/${i}.png` },
      })),
    )
    expect(select).not.toHaveBeenCalled()
    expect(authorizeMany).toHaveBeenCalledTimes(1)
    const resolved = authorizeMany.mock.calls[0][0]
    expect(resolved).toHaveLength(100)
    expect(resolved[0].tenant.id).not.toBe('o/r')
    expect(resolved[0].target?.repository?.repoId).toBe('42')
    expect(resolved[99].target?.path).toBe('images/99.png')
    authorizeMany.mockClear()
    await expect(
      access.authorizeMany([
        request,
        {
          ...request,
          target: {
            ...request.target,
            repository: { owner: 'o', repo: 'r', repoId: 'wrong' },
          },
        },
      ]),
    ).rejects.toThrow('repository identity does not match')
    expect(authorizeMany).not.toHaveBeenCalled()
    select.mockClear()
    await access.authorizeMany([request])
    expect(select).not.toHaveBeenCalled()
  } finally {
    client.close()
  }
})
