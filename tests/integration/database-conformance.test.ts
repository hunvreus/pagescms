import { readdir, readFile } from 'node:fs/promises'

import { createClient } from '@libsql/client'
import { eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { createLibSqlDatabase } from '#/server/database/client.server'
import { createD1Database, executeAtomic } from '#/server/database/core.server'
import {
  actionRunTable,
  cacheFileMetaTable,
  cacheFileTable,
  cachePermissionTable,
  collaboratorTable,
  githubInstallationTokenTable,
  sessionTable,
  userTable,
} from '#/server/database/schema'
import {
  buildCachePublication,
  executeCachePublications,
} from '#/server/directory-cache-store.server'
import { handleGitHubWebhook } from '#/server/github-webhook.server'

import type { Miniflare } from 'miniflare'
import type { Database } from '#/server/database/client.server'

const migrationDirectory = new URL('../../drizzle/', import.meta.url)

async function migrateD1(binding: D1Database) {
  const files = (await readdir(migrationDirectory))
    .filter((file) => file.endsWith('.sql'))
    .sort()
  for (const file of files) {
    const migration = await readFile(new URL(file, migrationDirectory), 'utf8')
    const statements = migration
      .split('--> statement-breakpoint')
      .map((statement) => statement.trim())
      .filter(Boolean)
    await binding.batch(
      statements.map((statement) => binding.prepare(statement)),
    )
  }
}

type Harness = {
  database: Database
  close: () => Promise<void>
}

function conformance(name: string, createHarness: () => Promise<Harness>) {
  describe(`${name} persistence conformance`, () => {
    let harness: Harness

    beforeAll(async () => {
      harness = await createHarness()
    })

    beforeEach(async () => {
      await harness.database.delete(actionRunTable)
      await harness.database.delete(cacheFileTable)
      await harness.database.delete(cacheFileMetaTable)
      await harness.database.delete(cachePermissionTable)
      await harness.database.delete(collaboratorTable)
      await harness.database.delete(sessionTable)
      await harness.database.delete(userTable)
    })

    afterAll(async () => {
      await harness.close()
    })

    it('preserves auth timestamps, booleans, uniqueness, and foreign keys', async () => {
      const now = new Date('2026-09-26T01:02:03.456Z')
      await harness.database.insert(userTable).values({
        id: 'user-1',
        name: 'Editor',
        email: 'editor@example.com',
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      })
      await harness.database.insert(sessionTable).values({
        id: 'session-1',
        token: 'token-1',
        userId: 'user-1',
        expiresAt: new Date(now.getTime() + 60_000),
        createdAt: now,
        updatedAt: now,
      })

      const user = await harness.database.query.userTable.findFirst({
        where: eq(userTable.id, 'user-1'),
      })
      expect(user).toMatchObject({
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      })
      await expect(
        harness.database.insert(userTable).values({
          id: 'user-2',
          name: 'Duplicate',
          email: 'editor@example.com',
        }),
      ).rejects.toThrow()

      await harness.database.delete(userTable).where(eq(userTable.id, 'user-1'))
      expect(await harness.database.select().from(sessionTable)).toHaveLength(0)
    })

    it('rolls back a failed atomic batch', async () => {
      await expect(
        executeAtomic(harness.database, [
          {
            sql: 'insert into user (id, name, email, email_verified, created_at, updated_at) values (?, ?, ?, ?, ?, ?)',
            args: ['duplicate', 'First', 'first@example.com', 0, 1, 1],
          },
          {
            sql: 'insert into user (id, name, email, email_verified, created_at, updated_at) values (?, ?, ?, ?, ?, ?)',
            args: ['duplicate', 'Second', 'second@example.com', 0, 1, 1],
          },
        ]),
      ).rejects.toThrow()
      expect(await harness.database.select().from(userTable)).toHaveLength(0)
    })

    it('preserves generated IDs, JSON values, and permission uniqueness', async () => {
      const [action] = await harness.database
        .insert(actionRunTable)
        .values({
          owner: 'pagescms',
          repo: 'website',
          ref: 'refs/heads/main',
          workflowRef: 'pagescms/action@main',
          sha: 'abc123',
          actionName: 'publish',
          contextType: 'collection',
          contextName: 'posts',
          workflow: 'publish.yml',
          status: 'queued',
          triggeredBy: { id: 'user-1', type: 'user' },
          payload: { paths: ['content/post.md'], dryRun: false },
        })
        .returning()

      expect(action.id).toBeGreaterThan(0)
      expect(action.triggeredBy).toEqual({ id: 'user-1', type: 'user' })
      expect(action.payload).toEqual({
        paths: ['content/post.md'],
        dryRun: false,
      })

      await harness.database.insert(cachePermissionTable).values({
        githubId: 42,
        owner: 'PagesCMS',
        repo: 'Website',
        lastUpdated: new Date(),
      })
      await expect(
        harness.database.insert(cachePermissionTable).values({
          githubId: 42,
          owner: 'PagesCMS',
          repo: 'Website',
          lastUpdated: new Date(),
        }),
      ).rejects.toThrow()

      await harness.database.insert(collaboratorTable).values({
        type: 'repository',
        installationId: 1,
        ownerId: 2,
        repoId: 3,
        owner: 'PagesCMS',
        repo: 'Website',
        branch: 'main',
        email: 'Editor@example.com',
      })
      await expect(
        harness.database.insert(collaboratorTable).values({
          type: 'repository',
          installationId: 1,
          ownerId: 2,
          repoId: 3,
          owner: 'pagescms',
          repo: 'website',
          branch: 'main',
          email: 'editor@example.com',
        }),
      ).rejects.toThrow()
    })

    it('allows only one concurrent cache publication to claim a snapshot', async () => {
      const scope = {
        source: 'github.com',
        owner: 'pagescms',
        repo: 'website',
        branch: 'main',
        path: 'content',
        context: 'collection',
      }
      const updatedAt = new Date('2026-09-26T02:00:00.000Z')
      await harness.database
        .insert(cacheFileMetaTable)
        .values({ ...scope, status: 'stale', updatedAt })
      const snapshot = (
        await harness.database.select().from(cacheFileMetaTable)
      )[0]
      const publication = (entryName: string, revision: string) =>
        buildCachePublication(harness.database, {
          scope,
          snapshot,
          entries: [
            {
              type: 'file' as const,
              name: entryName,
              path: `content/${entryName}`,
              sha: revision,
              content: entryName,
              size: entryName.length,
              downloadUrl: null,
            },
          ],
          removed: [],
          revision,
          now: new Date(updatedAt.getTime() + 100),
        })
      const [first, second] = await Promise.all([
        publication('first.md', 'revision-1'),
        publication('second.md', 'revision-2'),
      ])
      const results = await Promise.all([
        executeCachePublications(harness.database, [first]),
        executeCachePublications(harness.database, [second]),
      ])

      expect(results.flat().filter(Boolean)).toHaveLength(1)
      const rows = await harness.database.select().from(cacheFileTable)
      expect(rows).toHaveLength(1)
      const meta = (await harness.database.select().from(cacheFileMetaTable))[0]
      expect(rows[0].commitSha).toBe(meta.commitSha)
    })

    it('publishes thousands of entries without exceeding parameter limits', async () => {
      const scope = {
        source: 'github.com',
        owner: 'pagescms',
        repo: 'large',
        branch: 'main',
        path: 'content',
        context: 'collection',
      }
      await harness.database
        .insert(cacheFileMetaTable)
        .values({ ...scope, status: 'stale' })
      const snapshot = (
        await harness.database.select().from(cacheFileMetaTable)
      )[0]
      const publication = await buildCachePublication(harness.database, {
        scope,
        snapshot,
        entries: Array.from({ length: 3_000 }, (_, index) => ({
          type: 'file' as const,
          name: `${index}.md`,
          path: `content/${index}.md`,
          sha: `sha-${index}`,
          content: `entry ${index}`,
          size: 10,
          downloadUrl: null,
        })),
        removed: [],
        revision: 'large-revision',
        now: new Date(),
      })
      expect(
        await executeCachePublications(harness.database, [publication]),
      ).toEqual([true])
      const [{ count }] = await harness.database
        .select({ count: sql<number>`count(*)` })
        .from(cacheFileTable)
      expect(Number(count)).toBe(3_000)
    })
  })
}

const databaseUrl = process.env.TEST_DATABASE_URL
const cacheDatabaseUrl = process.env.TEST_CACHE_DATABASE_URL
if (databaseUrl) {
  conformance('local SQLite', async () => {
    const client = createClient({ url: databaseUrl })
    return {
      database: createLibSqlDatabase(client),
      close: async () => client.close(),
    }
  })
}

if (databaseUrl && cacheDatabaseUrl) {
  describe('separate local SQLite targets', () => {
    it('keeps cache state out of the application database', async () => {
      const applicationClient = createClient({ url: databaseUrl })
      const cacheClient = createClient({ url: cacheDatabaseUrl })
      try {
        const database = createLibSqlDatabase(applicationClient)
        const cacheDatabase = createLibSqlDatabase(cacheClient)
        await cacheDatabase.insert(cachePermissionTable).values({
          githubId: 99,
          owner: 'pagescms',
          repo: 'separate-cache',
          lastUpdated: new Date(),
        })

        expect(await database.select().from(cachePermissionTable)).toHaveLength(
          0,
        )
        expect(
          await cacheDatabase.select().from(cachePermissionTable),
        ).toHaveLength(1)
      } finally {
        applicationClient.close()
        cacheClient.close()
      }
    })

    it('deletes installation state from the database that owns it', async () => {
      const applicationClient = createClient({ url: databaseUrl })
      const cacheClient = createClient({ url: cacheDatabaseUrl })
      try {
        const database = createLibSqlDatabase(applicationClient)
        const cacheDatabase = createLibSqlDatabase(cacheClient)
        await database.insert(collaboratorTable).values({
          type: 'repository',
          installationId: 123,
          ownerId: 1,
          repoId: 2,
          owner: 'pagescms',
          repo: 'website',
          email: 'editor@example.com',
        })
        await cacheDatabase.insert(githubInstallationTokenTable).values({
          installationId: 123,
          ciphertext: 'encrypted',
          iv: 'iv',
          expiresAt: new Date(Date.now() + 60_000),
        })

        await handleGitHubWebhook(
          database,
          'installation',
          {
            action: 'deleted',
            installation: { id: 123, account: { login: 'pagescms' } },
          },
          undefined,
          cacheDatabase,
        )

        expect(await database.select().from(collaboratorTable)).toHaveLength(0)
        expect(
          await cacheDatabase.select().from(githubInstallationTokenTable),
        ).toHaveLength(0)
      } finally {
        applicationClient.close()
        cacheClient.close()
      }
    })
  })
}

let miniflare: Miniflare | undefined
conformance('local D1', async () => {
  const { Miniflare } = await import('miniflare')
  miniflare = new Miniflare({
    modules: true,
    script: 'export default { fetch() { return new Response("ok") } }',
    d1Databases: { DATABASE: 'pagescms-conformance' },
  })
  const binding = await miniflare.getD1Database('DATABASE')
  await migrateD1(binding)
  return {
    database: createD1Database(binding),
    close: async () => {
      await miniflare?.dispose()
      miniflare = undefined
    },
  }
})
