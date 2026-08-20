import { count, eq, sql } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { createDatabase } from '#/server/database/client.server'
import {
  cacheFileMetaTable,
  cacheFileTable,
  collaboratorInviteTable,
} from '#/server/database/schema'
import {
  createDirectoryCache,
  invalidateDirectoryCache,
} from '#/server/directory-cache.server'

import type { GitHubApi } from '#/server/github-api.server'

const connectionString = process.env.TEST_DATABASE_URL
const integration = connectionString ? describe : describe.skip
const database = connectionString
  ? createDatabase({ connectionString, maxConnections: 1 })
  : null

integration('PostgreSQL integration', () => {
  beforeEach(async () => {
    await database!.delete(cacheFileTable)
    await database!.delete(cacheFileMetaTable)
    await database!.delete(collaboratorInviteTable)
  })

  afterAll(async () => {
    await database?.$client.end({ timeout: 1 })
  })

  it('applies every legacy-compatible migration', async () => {
    const result = await database!.execute<{ table_name: string }>(sql`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
    `)
    expect(result.map((row) => row.table_name)).toEqual(
      expect.arrayContaining([
        'user',
        'session',
        'account',
        'verification',
        'github_installation_token',
        'collaborator',
        'collaborator_invite',
        'config',
        'cache_file',
        'cache_file_meta',
        'cache_permission',
        'action_run',
      ]),
    )
  })

  it('enforces case-insensitive invitation uniqueness', async () => {
    const invitation = {
      token: 'first-token',
      email: 'Editor@Example.com',
      owner: 'PagesCMS',
      repo: 'Website',
      expiresAt: new Date('2030-01-01T00:00:00Z'),
    }
    await database!.insert(collaboratorInviteTable).values(invitation)
    await expect(
      database!.insert(collaboratorInviteTable).values({
        ...invitation,
        token: 'second-token',
        email: invitation.email.toLowerCase(),
        owner: invitation.owner.toLowerCase(),
        repo: invitation.repo.toLowerCase(),
      }),
    ).rejects.toThrow()
  })

  it('persists, reuses, and invalidates directory snapshots', async () => {
    const getDirectory = vi.fn().mockResolvedValue([
      {
        type: 'file' as const,
        name: 'hello.md',
        path: 'content/hello.md',
        sha: 'file-sha',
        content: 'title: Hello',
        size: 12,
      },
    ])
    const cache = createDirectoryCache({
      database: database!,
      clock: { now: () => new Date('2026-08-20T00:00:00Z') },
    })
    const input = {
      api: { getDirectory } as unknown as GitHubApi,
      owner: 'PagesCMS',
      repo: 'Website',
      branch: 'main',
      path: 'content',
      context: 'collection' as const,
      enabled: true,
    }

    await expect(cache.get(input)).resolves.toMatchObject({
      entries: [{ path: 'content/hello.md', sha: 'file-sha' }],
    })
    await expect(cache.get(input)).resolves.toMatchObject({
      entries: [{ path: 'content/hello.md', sha: 'file-sha' }],
    })
    expect(getDirectory).toHaveBeenCalledTimes(1)
    await expect(
      database!
        .select({ total: count() })
        .from(cacheFileTable)
        .where(eq(cacheFileTable.owner, 'pagescms')),
    ).resolves.toEqual([{ total: 1 }])

    await invalidateDirectoryCache(database!, 'PagesCMS', 'Website', 'main')
    await expect(
      database!.select({ total: count() }).from(cacheFileTable),
    ).resolves.toEqual([{ total: 0 }])
  })
})
