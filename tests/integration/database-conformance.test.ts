import { repositoryRows } from '../repository-fixture'
import { readdir, readFile } from 'node:fs/promises'
import { createHmac } from 'node:crypto'

import { createClient } from '@libsql/client'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { eq, sql } from 'drizzle-orm'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import { createLibSqlDatabase } from '#/server/db/client'
import { createD1Database, executeAtomic } from '#/server/db/core'
import {
  actionRunTable,
  cacheFileMetaTable,
  cacheFileTable,
  collaboratorInviteTable,
  collaboratorTable,
  githubInstallationTokenTable,
  sessionTable,
  userTable,
} from '#/server/db/schema'
import {
  buildCachePublication,
  executeCachePublications,
} from '#/server/cache/directory-store'
import { observeRepositoryIdentity } from '#/server/access/repository-identity'
import { createConfigurationStore } from '#/server/cache/configuration'
import { createPagesCmsAuth } from '#/server/auth/index'
import type { RepositoryApi } from '#/server/repository/provider'
import { handleGitHubWebhook } from '#/server/github/webhook'
import {
  inviteCollaborators,
  revokeCollaborators,
} from '#/server/collaborators/collaborators'
import { createRepositoryAccessService } from '#/server/access/repository'
import { encryptSecret } from '#/server/auth/secret-crypto'
import { createGitHubApi } from '#/server/github/api'
import {
  dispatchRepositoryAction,
  manageRepositoryAction,
  readActionRunStatuses,
} from '#/server/actions/actions'

import type { Miniflare } from 'miniflare'
import type { Database } from '#/server/db/client'

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
      await harness.database.delete(collaboratorInviteTable)
      await harness.database.delete(collaboratorTable)
      await harness.database.delete(sessionTable)
      await harness.database.delete(userTable)
    })

    afterAll(async () => {
      await harness.close()
    })

    it('returns saved preferences with a real authenticated session', async () => {
      const secret = 'test-only-auth-secret-at-least-32-characters'
      const token = 'conformance-session-token'
      await harness.database.insert(userTable).values({
        id: 'prefs-user',
        name: 'User',
        email: 'prefs@example.test',
        preferences: { language: 'fr' },
      })
      await harness.database.insert(sessionTable).values({
        id: 'prefs-session',
        userId: 'prefs-user',
        token,
        expiresAt: new Date(Date.now() + 60_000),
      })
      const auth = createPagesCmsAuth({
        database: harness.database,
        configuration: { baseUrl: 'http://localhost:3000', secret },
      })
      const signature = createHmac('sha256', secret)
        .update(token)
        .digest('base64')
      const cookie = encodeURIComponent(`${token}.${signature}`)
      const session = await auth.api.getSession({
        headers: new Headers({ cookie: `better-auth.session_token=${cookie}` }),
      })
      expect(session?.user.preferences).toMatchObject({ language: 'fr' })
      const update = await auth.handler(
        new Request('http://localhost:3000/api/auth/update-user', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            origin: 'http://localhost:3000',
            cookie: `better-auth.session_token=${cookie}`,
          },
          body: JSON.stringify({
            name: 'User',
            preferences: { language: 'en' },
          }),
        }),
      )
      expect(update.status).toBe(400)
      const validUpdate = await auth.handler(
        new Request('http://localhost:3000/api/auth/update-user', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            origin: 'http://localhost:3000',
            cookie: `better-auth.session_token=${cookie}`,
          },
          body: JSON.stringify({ name: 'Updated user' }),
        }),
      )
      expect(validUpdate.status).toBe(200)
      const stored = await harness.database.query.userTable.findFirst({
        where: eq(userTable.id, 'prefs-user'),
      })
      expect(stored?.preferences).toMatchObject({ language: 'fr' })
    })

    it('reads cached configuration through the admitted repository scope', async () => {
      const address = {
        id: 987654,
        ownerId: 987655,
        owner: 'scope-test',
        repo: 'scope-test',
      }
      const identity = await observeRepositoryIdentity(
        harness.database,
        address,
      )
      const store = createConfigurationStore({ database: harness.database })
      await store.save(address.owner, address.repo, 'main', 'scope-sha', {
        content: [],
      })
      const api = { source: 'github.com' } as RepositoryApi
      await expect(
        store.get(
          api,
          address.owner,
          address.repo,
          'main',
          String(address.id),
          {
            id: identity.id,
            externalId: String(address.id),
            source: 'github.com',
          },
        ),
      ).resolves.toMatchObject({ repositoryId: identity.id, sha: 'scope-sha' })
    })

    it('skips credentials and GitHub reads for empty and already-applied push caches', async () => {
      const database = harness.database
      const resolve = vi
        .fn()
        .mockRejectedValue(new Error('must not resolve credentials'))
      const scope = {
        owner: 'pagescms',
        repo: 'test',
        branch: 'main',
        path: 'posts',
        context: 'collection',
      }
      const payload = {
        repository: { name: scope.repo, owner: { login: scope.owner } },
        ref: 'refs/heads/main',
        before: 'before',
        after: 'after',
        installation: { id: 1 },
        commits: [{ added: [], removed: [], modified: ['posts/entry.md'] }],
      }
      await handleGitHubWebhook(database, 'push', payload, resolve)
      expect(await database.select().from(cacheFileMetaTable)).toEqual([])
      await database.insert(cacheFileMetaTable).values(
        await repositoryRows(database, {
          ...scope,
          status: 'ok',
          commitSha: 'after',
        }),
      )
      const before = await database.select().from(cacheFileMetaTable)
      await handleGitHubWebhook(database, 'push', payload, resolve)
      expect(await database.select().from(cacheFileMetaTable)).toEqual(before)
      expect(resolve).not.toHaveBeenCalled()
    })

    it('deletes removed memberships and isolates reinvitations from stale removal and email binding', async () => {
      const database = harness.database
      const createdAt = new Date('2026-10-16T01:02:03.456Z')
      const member = {
        type: 'user',
        installationId: 123,
        ownerId: 1,
        repoId: 929102,
        owner: 'conformance-owner',
        repo: 'conformance-invite',
        email: 'editor@example.com',
        createdAt,
      }
      const [original] = await database
        .insert(collaboratorTable)
        .values(member)
        .returning()
      await database.insert(collaboratorInviteTable).values({
        repoId: member.repoId,
        owner: member.owner,
        repo: member.repo,
        email: member.email,
        token: 'old-invitation',
        expiresAt: new Date(Date.now() + 60_000),
      })
      await expect(
        database
          .insert(collaboratorTable)
          .values({ ...member, email: 'EDITOR@example.com' }),
      ).rejects.toThrow()

      expect(
        await revokeCollaborators(database, {
          sql: 'collaborator.id = ?',
          args: [original.id],
        }),
      ).toBe(1)
      expect(await database.select().from(collaboratorTable)).toEqual([])
      expect(
        await database.select().from(collaboratorInviteTable),
      ).toHaveLength(0)

      const [fresh] = await database
        .insert(collaboratorTable)
        .values({ ...member, createdAt: new Date() })
        .returning()
      expect(fresh.id).not.toBe(original.id)
      await database.insert(collaboratorInviteTable).values({
        repoId: member.repoId,
        owner: member.owner,
        repo: member.repo,
        email: member.email,
        token: 'new-invitation',
        expiresAt: new Date(Date.now() + 60_000),
      })
      expect(
        await revokeCollaborators(database, {
          sql: 'collaborator.id = ?',
          args: [original.id],
        }),
      ).toBe(0)
      expect(
        (await database.select().from(collaboratorInviteTable))[0].token,
      ).toBe('new-invitation')
      await database.insert(userTable).values({
        id: 'verified-editor',
        name: 'Editor',
        email: member.email,
        emailVerified: true,
      })
      await observeRepositoryIdentity(database, {
        id: member.repoId,
        ownerId: member.ownerId,
        owner: member.owner,
        repo: member.repo,
      })
      const cryptoKey = btoa(
        String.fromCharCode(...new Uint8Array(32).fill(31)),
      )
      await database.insert(githubInstallationTokenTable).values({
        installationId: member.installationId,
        ...(await encryptSecret('cached-installation-token', cryptoKey)),
        expiresAt: new Date(Date.now() + 600_000),
      })
      const access = createRepositoryAccessService({
        database,
        cacheDatabase: database,
        githubApp: { appId: '123', privateKey: 'cached-token-only', cryptoKey },
        readGitHubAccount: async () => null,
        githubApiFactory: () => ({
          ...createGitHubApi('test-token'),
          getRepository: async () => ({
            id: member.repoId,
            ownerId: member.ownerId,
            owner: member.owner,
            repo: member.repo,
            defaultBranch: 'main',
            private: true,
            canPush: true,
          }),
        }),
      })
      await expect(
        access.resolve(
          {
            id: 'verified-editor',
            email: 'EDITOR@example.com',
            emailVerified: true,
            githubUsername: null,
          },
          member.owner,
          member.repo,
        ),
      ).resolves.toMatchObject({
        membershipId: String(fresh.id),
      })
      const rows = await database
        .select()
        .from(collaboratorTable)
        .orderBy(collaboratorTable.id)
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({
        id: fresh.id,
        userId: 'verified-editor',
      })
    })

    it('rolls back invitation revocation when deleting the membership fails', async () => {
      const database = harness.database
      await database.insert(collaboratorTable).values({
        type: 'user',
        installationId: 123,
        ownerId: 1,
        repoId: 2,
        owner: 'pagescms',
        repo: 'website',
        email: 'editor@example.com',
      })
      await database.insert(collaboratorInviteTable).values({
        repoId: 2,
        owner: 'pagescms',
        repo: 'website',
        email: 'editor@example.com',
        token: 'pending-invitation',
        expiresAt: new Date(Date.now() + 60_000),
      })
      await database.run(
        sql`CREATE TRIGGER reject_membership_removal BEFORE DELETE ON collaborator BEGIN SELECT RAISE(ABORT, 'cannot delete membership'); END`,
      )
      try {
        await expect(
          revokeCollaborators(database, {
            sql: 'collaborator.repo_id = ?',
            args: [2],
          }),
        ).rejects.toThrow()
        expect(
          (await database.select().from(collaboratorTable))[0],
        ).toMatchObject({ createdAt: null })
        expect(
          await database.select().from(collaboratorInviteTable),
        ).toHaveLength(1)
      } finally {
        await database.run(sql`DROP TRIGGER reject_membership_removal`)
      }
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
        .values(
          await repositoryRows(harness.database, {
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
          }),
        )
        .returning()

      expect(action.id).toBeGreaterThan(0)
      expect(action.triggeredBy).toEqual({ id: 'user-1', type: 'user' })
      expect(action.payload).toEqual({
        paths: ['content/post.md'],
        dryRun: false,
      })
    })

    it('activates invitations and rolls them back when a grant fails', async () => {
      const database = harness.database
      const repository = {
        id: 112233,
        ownerId: 112234,
        owner: 'owner',
        repo: 'invite',
        canPush: true,
      }
      await observeRepositoryIdentity(database, repository)
      await database.insert(userTable).values({
        id: 'manager',
        name: 'Manager',
        email: 'manager@example.com',
      })
      const send = vi.fn(async () => undefined)
      const input = {
        database,
        emailProvider: { send },
        baseUrl: 'https://cms.example.com',
        user: {
          id: 'manager',
          name: 'Manager',
          email: 'manager@example.com',
          githubUsername: 'manager',
        },
        owner: 'owner',
        repo: 'invite',
        repositoryAccess: {
          resolve: async () => ({ api: {}, tokenSource: 'user', repository }),
        } as never,
        installationLookup: async () => ({
          id: 33,
          account: { login: 'owner', type: 'User' as const },
        }),
      }
      await inviteCollaborators({
        ...input,
        emails: ['first@example.com'],
        afterCreate: async () => undefined,
      })
      expect(await database.select().from(collaboratorTable)).toMatchObject([
        { email: 'first@example.com', pending: false },
      ])
      await expect(
        inviteCollaborators({
          ...input,
          emails: ['second@example.com'],
          afterCreate: async () => {
            throw new Error('grant failed')
          },
        }),
      ).rejects.toThrow('grant failed')
      expect(await database.select().from(collaboratorTable)).toHaveLength(1)
      expect(send).toHaveBeenCalledOnce()
    })

    it('dispatches and cancels an action run', async () => {
      const database = harness.database
      const repository = {
        id: 10101,
        ownerId: 10102,
        owner: 'owner',
        repo: 'dispatch',
      }
      const identity = await observeRepositoryIdentity(database, repository)
      await createConfigurationStore({ database }).save(
        'owner',
        'dispatch',
        'main',
        'sha',
        {
          content: [],
          actions: [
            { name: 'publish', label: 'Publish', workflow: 'publish.yml' },
          ],
        },
      )
      const api = {
        source: 'github.com',
        getRefSha: async () => 'sha',
        dispatchWorkflow: vi.fn(async () => undefined),
        cancelWorkflowRun: vi.fn(async () => undefined),
      }
      const input = {
        database,
        cacheDatabase: database,
        repositoryAccess: {
          resolve: async () => ({
            api,
            repository,
            tokenSource: 'user',
            identity: {
              applicationId: identity.id,
              cacheId: identity.id,
              externalId: String(repository.id),
              source: 'github.com',
            },
          }),
        } as never,
        user: {
          id: 'user-1',
          name: 'User',
          email: 'user@example.com',
          githubUsername: 'user',
        },
        owner: 'owner',
        repo: 'dispatch',
        branch: 'main',
        allowCollaboratorExecution: true,
        actionName: 'publish',
        inputs: {},
        context: {
          type: 'repository' as const,
          name: null,
          path: null,
          data: {},
        },
      }
      const run = await dispatchRepositoryAction(input)
      expect(run.status).toBe('queued')
      await database
        .update(actionRunTable)
        .set({ workflowRunId: 100 })
        .where(eq(actionRunTable.id, run.id))
      expect(
        await manageRepositoryAction({
          ...input,
          runId: run.id,
          intent: 'cancel',
        }),
      ).toMatchObject({
        status: 'completed',
        conclusion: 'cancelled',
      })
      expect(api.cancelWorkflowRun).toHaveBeenCalledOnce()
    })

    it('recovers an action status and records the completed run', async () => {
      const database = harness.database
      const [run] = await database
        .insert(actionRunTable)
        .values(
          await repositoryRows(database, {
            owner: 'owner',
            repo: 'actions',
            ref: 'main',
            workflowRef: 'main',
            sha: 'abc',
            actionName: 'publish',
            contextType: 'repository',
            workflow: 'publish.yml',
            status: 'queued',
            workflowRunId: 918273,
            triggeredBy: { userId: 'user-1' },
            payload: {},
          }),
        )
        .returning()
      const getWorkflowRun = vi.fn(async () => ({
        status: 'completed',
        conclusion: 'success',
        htmlUrl: 'https://github.com/run',
        updatedAt: new Date().toISOString(),
      }))
      const result = await readActionRunStatuses({
        database,
        cacheDatabase: database,
        repositoryAccess: {
          resolve: async () => ({ api: { getWorkflowRun } }),
        } as never,
        user: {
          id: 'user-1',
          name: 'User',
          email: 'user@example.com',
          githubUsername: 'user',
        },
        owner: 'owner',
        repo: 'actions',
        branch: 'main',
        runIds: [run.id],
      })
      expect(result.runs).toMatchObject([
        { id: run.id, status: 'completed', conclusion: 'success' },
      ])
      expect(getWorkflowRun).toHaveBeenCalledOnce()
    })

    it('keeps a completed workflow when an older delivery arrives', async () => {
      const database = harness.database
      const [run] = await database
        .insert(actionRunTable)
        .values(
          await repositoryRows(database, {
            owner: 'workflow-owner',
            repo: 'webhook-order',
            ref: 'refs/heads/main',
            workflowRef: 'workflow-owner/action@main',
            sha: 'abc123',
            actionName: 'publish',
            contextType: 'collection',
            contextName: 'posts',
            workflow: 'publish.yml',
            status: 'queued',
            workflowRunId: 918273,
            updatedAt: new Date('2026-10-01T10:00:00Z'),
            triggeredBy: { id: 'user-1', type: 'user' },
            payload: {},
          }),
        )
        .returning()
      for (const [status, updated_at] of [
        ['completed', '2026-10-01T10:02:00Z'],
        ['in_progress', '2026-10-01T10:01:00Z'],
        ['in_progress', '2026-10-01T10:02:00Z'],
      ]) {
        await handleGitHubWebhook(database, 'workflow_run', {
          workflow_run: { id: run.workflowRunId, status, updated_at },
        })
      }
      const latest = await database.query.actionRunTable.findFirst({
        where: eq(actionRunTable.id, run.id),
      })
      expect(latest?.status).toBe('completed')
      expect(latest?.completedAt).toEqual(new Date('2026-10-01T10:02:00Z'))
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
      await harness.database.insert(cacheFileMetaTable).values(
        await repositoryRows(harness.database, {
          ...scope,
          status: 'stale',
          updatedAt,
        }),
      )
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
              sha: `blob-${revision}`,
              commitSha: `change-${revision}`,
              commitTimestamp: '2026-09-26T01:00:00.000Z',
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
      expect(rows[0].sha).toBe(`blob-${meta.commitSha}`)
      expect(rows[0].commitSha).toBe(`change-${meta.commitSha}`)
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
        .values(
          await repositoryRows(harness.database, { ...scope, status: 'stale' }),
        )
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
    }, 30_000)
  })
}

const databaseUrl = process.env.TEST_DATABASE_URL
const cacheDatabaseUrl = process.env.TEST_CACHE_DATABASE_URL
conformance('in-memory libSQL', async () => {
  const client = createClient({ url: 'file::memory:' })
  const database = createLibSqlDatabase(client)
  await migrate(database, { migrationsFolder: './drizzle' })
  return { database, close: async () => client.close() }
})
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
        await cacheDatabase.insert(cacheFileMetaTable).values(
          await repositoryRows(cacheDatabase, {
            owner: 'pagescms',
            repo: 'isolated',
            branch: 'main',
          }),
        )
        expect(
          await database
            .select()
            .from(cacheFileMetaTable)
            .where(eq(cacheFileMetaTable.repo, 'isolated')),
        ).toHaveLength(0)
        expect(
          await cacheDatabase
            .select()
            .from(cacheFileMetaTable)
            .where(eq(cacheFileMetaTable.repo, 'isolated')),
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

        expect(await database.select().from(collaboratorTable)).toEqual([])
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
