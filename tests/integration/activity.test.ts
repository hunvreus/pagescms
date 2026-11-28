import { repositoryRows } from '../repository-fixture'
import { readdir, readFile } from 'node:fs/promises'
import { createClient } from '@libsql/client'
import { and, eq } from 'drizzle-orm'
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
import type { Database } from '#/server/db/client'
import {
  activityTable,
  cacheFileTable,
  configTable,
  userTable,
  collaboratorTable,
  collaboratorInviteTable,
  actionRunTable,
} from '#/server/db/schema'
import { revokeCollaborators } from '#/server/collaborators/collaborators'
import { recordActivity, readActivity } from '#/server/activity/store'
import type { ActivityEvent } from '#/server/activity/store'
import { capturePushActivity } from '#/server/activity/webhook'
import * as webhookActivity from '#/server/activity/webhook'
import { withActivityCapture } from '#/server/activity/capture'
import { loadActivity } from '#/server/services/activity'
import {
  createAccessPolicyGateway,
  AccessDeniedError,
} from '#/server/access/policy'
import type { AccessRequest } from '#/server/access/policy'
import { createConfigurationStore } from '#/server/cache/configuration'
import { activityActors } from '#/server/activity/details'
import { handleGitHubWebhook } from '#/server/github/webhook'
import {
  findRepositoryIdentityByExternalId,
  observeRepositoryIdentity,
} from '#/server/access/repository-identity'

const coordinates = { owner: 'owner', repo: 'repo', branch: 'main' }
const config = {
  content: [
    { type: 'collection', name: 'posts', path: 'posts', extension: 'md' },
  ],
  media: [{ name: 'images', input: 'images', output: '/images' }],
}
const start = Date.parse('2026-10-16T00:00:00Z')
const event = (
  number: number,
  patch: Partial<ActivityEvent> = {},
): ActivityEvent => ({
  ...coordinates,
  kind: 'edited',
  area: 'collection',
  resource: 'posts',
  path: 'posts/a.md',
  commitSha: `commit-${number}`,
  origin: 'webhook',
  occurredAt: new Date(start + number * 1000),
  ...patch,
})
const request: AccessRequest = {
  operation: 'repository.read',
  principal: { type: 'user', id: 'user' },
  tenant: { type: 'repository', id: 'owner/repo' },
  target: { repository: coordinates, branch: 'main' },
}
const access = () => createAccessPolicyGateway({ required: false })
const push = (
  id: string,
  added: string[] = [],
  modified: string[] = [],
  removed: string[] = [],
) => ({
  repository: { name: 'repo', owner: { login: 'owner' } },
  ref: 'refs/heads/main',
  before: 'before',
  after: id,
  installation: { id: 1 },
  commits: [
    {
      id,
      timestamp: new Date(start + 1000).toISOString(),
      author: { name: 'Someone' },
      added,
      modified,
      removed,
    },
  ],
})

for (const adapter of ['SQLite', 'D1'] as const)
  describe(`${adapter} repository activity`, { timeout: 30_000 }, () => {
    let database: Database
    let close: () => Promise<unknown>
    beforeAll(async () => {
      if (adapter === 'SQLite') {
        const client = createClient({ url: ':memory:' })
        database = createLibSqlDatabase(client)
        close = async () => client.close()
      } else {
        const { Miniflare } = await import('miniflare')
        const runtime = new Miniflare({
          modules: true,
          script: 'export default { fetch() { return new Response("test") } }',
          compatibilityDate: '2026-07-30',
          d1Databases: ['DATABASE'],
        })
        database = createD1Database(await runtime.getD1Database('DATABASE'))
        close = () => runtime.dispose()
      }
      const directory = new URL('../../drizzle/', import.meta.url)
      for (const name of (await readdir(directory))
        .filter((filename) => filename.endsWith('.sql'))
        .sort()) {
        await executeAtomic(
          database,
          (await readFile(new URL(name, directory), 'utf8'))
            .split('--> statement-breakpoint')
            .map((sql) => ({ sql: sql.trim() }))
            .filter(({ sql }) => sql),
        )
      }
    }, 30000)
    afterAll(async () => {
      await close()
    })
    beforeEach(async () => {
      await database.delete(activityTable)
      await database.delete(cacheFileTable)
      await database.delete(configTable)
      await database.delete(actionRunTable)
      await database.delete(collaboratorInviteTable)
      await database.delete(collaboratorTable)
      await database.delete(userTable)
      await database.insert(userTable).values({
        id: 'user',
        name: 'Writer',
        email: 'writer@example.com',
        image: 'https://profiles.example.test/writer.png',
      })
      await createConfigurationStore({ database }).save(
        'owner',
        'repo',
        'main',
        'config',
        config,
      )
    })

    it('retains 50 actual events, not just one version of each file', async () => {
      await recordActivity(
        database,
        Array.from({ length: 80 }, (_, i) => event(i)),
      )
      const rows = await readActivity(database, coordinates)
      expect(rows).toHaveLength(50)
      expect(rows[0].commitSha).toBe('commit-79')
      expect(rows.at(-1)?.commitSha).toBe('commit-30')
      await recordActivity(database, [event(0), event(79)])
      expect(await readActivity(database, coordinates)).toHaveLength(50)
    })

    it.each(['cms-first', 'webhook-first', 'concurrent'] as const)(
      'deduplicates CMS renames and webhook delete/add in %s order',
      async (order) => {
        const renamed = event(1, {
          kind: 'renamed',
          origin: 'cms',
          path: 'posts/new.md',
          previousPath: 'posts/old.md',
          actor: 'Writer',
          actorImage: 'https://profiles.example.test/writer.png',
        })
        const incoming = [
          event(1, { kind: 'deleted', path: 'posts/old.md' }),
          event(1, { kind: 'added', path: 'posts/new.md' }),
        ]
        if (order === 'cms-first') {
          await recordActivity(database, [renamed])
          await recordActivity(database, incoming)
        } else if (order === 'webhook-first') {
          await recordActivity(database, incoming)
          await recordActivity(database, [renamed])
        } else
          await Promise.all([
            recordActivity(database, incoming),
            recordActivity(database, [renamed]),
          ])
        expect(await readActivity(database, coordinates)).toMatchObject([
          {
            kind: 'renamed',
            path: 'posts/new.md',
            previousPath: 'posts/old.md',
            actor: 'Writer',
            actorImage: 'https://profiles.example.test/writer.png',
          },
        ])
        expect(await readActivity(database, coordinates)).toHaveLength(1)
      },
    )

    it('keeps branch and repository-wide retention independent', async () => {
      await recordActivity(database, [
        ...Array.from({ length: 60 }, (_, i) => event(i)),
        ...Array.from({ length: 60 }, (_, i) => event(i, { branch: 'other' })),
        event(100, { branch: '', area: 'collaborator', kind: 'added' }),
      ])
      expect(await readActivity(database, coordinates)).toHaveLength(51)
      expect(
        await readActivity(database, { ...coordinates, branch: 'other' }),
      ).toHaveLength(51)
    })

    it('captures configured webhook paths without cached directories or GitHub calls', async () => {
      const resolve = vi
        .fn()
        .mockRejectedValue(new Error('must not call GitHub'))
      await handleGitHubWebhook(
        database,
        'push',
        push(
          'change',
          ['posts/a.md', 'images/new.png'],
          ['unconfigured/private.txt'],
        ),
        resolve,
      )
      expect(resolve).not.toHaveBeenCalled()
      expect(
        (await readActivity(database, coordinates))
          .map((row) => row.area)
          .sort(),
      ).toEqual(['collection', 'media'])
      await handleGitHubWebhook(
        database,
        'push',
        push('change', ['posts/a.md', 'images/new.png']),
        resolve,
      )
      expect(await readActivity(database, coordinates)).toHaveLength(2)
    })

    it('does not delay a webhook response for activity capture', async () => {
      let release!: () => void
      const pending = new Promise<void>((resolve) => {
        release = resolve
      })
      const capture = vi
        .spyOn(webhookActivity, 'safelyCapturePushActivity')
        .mockReturnValueOnce(pending)
      const waitUntil = vi.fn()
      try {
        await handleGitHubWebhook(
          database,
          'push',
          push('background', ['posts/a.md']),
          undefined,
          database,
          undefined,
          waitUntil,
        )
        expect(waitUntil).toHaveBeenCalledOnce()
      } finally {
        release()
        await Promise.all(waitUntil.mock.calls.map(([task]) => task))
        capture.mockRestore()
      }
    })

    it('does not manufacture events from a branch copy or configuration exclusions', async () => {
      await capturePushActivity(database, database, {
        ...push('copy', ['posts/a.md']),
        created: true,
      })
      await capturePushActivity(
        database,
        database,
        push('config-change', [], ['.pages.yml']),
        { content: [] },
      )
      expect(await readActivity(database, coordinates)).toMatchObject([
        { area: 'configuration', kind: 'edited' },
      ])
      expect(await readActivity(database, coordinates)).toHaveLength(1)
    })

    it('keeps unverified external renames as explicit delete/add events', async () => {
      await capturePushActivity(
        database,
        database,
        push('outside-rename', ['posts/new.md'], [], ['posts/old.md']),
      )
      expect(
        (await readActivity(database, coordinates))
          .map((row) => row.kind)
          .sort(),
      ).toEqual(['added', 'deleted'])
    })

    it('preserves activity when configuration or content cache is cleared', async () => {
      await recordActivity(database, [event(1)])
      await database.delete(configTable)
      expect(await readActivity(database, coordinates)).toHaveLength(1)
    })

    it('records successful saves and never records failed saves', async () => {
      const gateway = withActivityCapture(access(), database, database)
      const mutation: AccessRequest = {
        ...request,
        operation: 'entry.update',
        target: {
          ...request.target,
          collection: 'posts',
          path: 'posts/a.md',
        },
      }
      await expect(
        gateway.execute(mutation, async () => {
          throw new Error('conflict')
        }),
      ).rejects.toThrow('conflict')
      expect(await readActivity(database, coordinates)).toHaveLength(0)
      await gateway.execute(mutation, async () => ({
        path: 'posts/a.md',
        commitSha: 'saved',
        commitTimestamp: new Date(start).toISOString(),
        entry: {
          filename: 'a.md',
          primaryField: 'title',
          content: { title: 'Saved primary title' },
        },
      }))
      await capturePushActivity(
        database,
        database,
        push('saved', [], ['posts/a.md']),
      )
      expect(await readActivity(database, coordinates)).toMatchObject([
        {
          actor: 'Writer',
          actorId: 'user',
          title: 'Saved primary title',
          actorImage: 'https://profiles.example.test/writer.png',
          kind: 'edited',
          origin: 'cms',
        },
      ])
      expect(await readActivity(database, coordinates)).toHaveLength(1)
    })

    it('records an unpinned request against the admitted repository after address reuse', async () => {
      await observeRepositoryIdentity(database, {
        ...coordinates,
        id: 9201,
        ownerId: 9301,
      })
      const admitted = await findRepositoryIdentityByExternalId(
        database,
        '9201',
      )
      await observeRepositoryIdentity(database, {
        ...coordinates,
        id: 9202,
        ownerId: 9302,
      })
      const gateway = withActivityCapture(access(), database, database)
      await gateway.execute(
        {
          ...request,
          operation: 'entry.update',
          principal: {
            type: 'user',
            id: 'user',
            repositoryIdentity: {
              source: 'github.com',
              externalId: '9201',
              ownerId: '9301',
            },
          },
          target: {
            repository: coordinates,
            branch: 'main',
            collection: 'posts',
            path: 'posts/a.md',
          },
        },
        async () => ({
          path: 'posts/a.md',
          commitSha: 'identity-bound',
          commitTimestamp: new Date(start).toISOString(),
        }),
      )
      const rows = await database.select().from(activityTable)
      expect(rows).toHaveLength(1)
      expect(rows[0].repositoryId).toBe(admitted!.id)
    })

    it('does not show replacement repository activity for a pinned ID', async () => {
      const original = await observeRepositoryIdentity(database, {
        ...coordinates,
        id: 9401,
        ownerId: 9501,
      })
      await recordActivity(database, [event(0, { repositoryId: original.id })])
      await observeRepositoryIdentity(database, {
        ...coordinates,
        id: 9402,
        ownerId: 9502,
      })
      await recordActivity(database, [event(1)])
      expect(
        await readActivity(database, { ...coordinates, repoId: '9401' }),
      ).toMatchObject([{ repositoryId: original.id, commitSha: 'commit-0' }])
      expect(
        await readActivity(database, { ...coordinates, repoId: '9402' }),
      ).toHaveLength(1)
    })

    it('uses webhook profile images only for the matching author identity', async () => {
      const first = push('with-image', [], ['posts/a.md'])
      await capturePushActivity(database, database, {
        ...first,
        sender: {
          login: 'writer',
          avatar_url: 'https://profiles.example.test/writer.png',
        },
        commits: first.commits.map((commit) => ({
          ...commit,
          author: { name: 'Someone', username: 'writer' },
        })),
      })
      const second = push('different-author', [], ['posts/b.md'])
      await capturePushActivity(database, database, {
        ...second,
        sender: {
          login: 'writer',
          avatar_url: 'https://profiles.example.test/writer.png',
        },
        commits: second.commits.map((commit) => ({
          ...commit,
          author: { name: 'Someone', username: 'other-writer' },
        })),
      })
      const rows = await readActivity(database, coordinates)
      expect(
        rows.find((row) => row.commitSha === 'with-image')?.actorImage,
      ).toBe('https://profiles.example.test/writer.png')
      expect(
        rows.find((row) => row.commitSha === 'different-author')?.actorImage,
      ).toBeNull()
    })

    it('uses actor IDs without guessing identities from display names', async () => {
      const base = {
        id: 'new',
        area: 'collection' as const,
        resource: 'posts',
        kind: 'edited' as const,
        path: 'posts/a.md',
        previousPath: null,
        actor: 'Writer',
        occurredAt: new Date(start).toISOString(),
      }
      const legacy = { ...base, id: 'old' }
      const identified = {
        ...base,
        actorId: 'user',
        actorImage: 'https://profiles.example.test/old.png',
      }
      const resolved = await activityActors(database, [legacy, identified])
      expect(resolved.map((item) => item.actorImage)).toEqual([
        null,
        'https://profiles.example.test/writer.png',
      ])
      expect(JSON.stringify(resolved)).not.toContain('actorId')
      const ambiguous = await activityActors(database, [
        legacy,
        identified,
        {
          ...base,
          id: 'other',
          actorId: 'other-user',
          actorImage: 'https://profiles.example.test/other.png',
        },
      ])
      expect(ambiguous[0].actorImage).toBeNull()
      expect(ambiguous[2].actorImage).toBe(
        'https://profiles.example.test/other.png',
      )
    })

    it('returns cached primary titles only after read authorization and never exposes cached bodies', async () => {
      await createConfigurationStore({ database }).save(
        'owner',
        'repo',
        'main',
        'nested-primary',
        {
          ...config,
          content: [
            { ...config.content[0], view: { primary: 'details.headline' } },
          ],
        },
      )
      await database.insert(cacheFileTable).values(
        await repositoryRows(database, {
          source: 'github.com',
          context: 'collection',
          owner: 'owner',
          repo: 'repo',
          branch: 'main',
          parentPath: 'posts',
          name: 'a.md',
          path: 'posts/a.md',
          type: 'file',
          content:
            '---\ndetails:\n  headline: Primary field title\n---\nprivate body',
          updatedAt: new Date(),
        }),
      )
      await recordActivity(database, [event(1)])
      const gateway = access()
      const input = {
        database,
        cacheDatabase: database,
        access: gateway,
        request,
        ...coordinates,
        page: 0,
      }
      const first = await loadActivity(input)
      expect(first.items[0].title).toBe('Primary field title')
      expect(JSON.stringify(first)).not.toContain('private body')
      gateway.authorize = async (policy) => {
        if (policy.operation === 'entry.read')
          throw new AccessDeniedError({
            allowed: false,
            reason: 'permission_denied',
          })
        return undefined
      }
      expect((await loadActivity(input)).items).toHaveLength(0)
      gateway.authorize = async () => undefined
      await database.delete(cacheFileTable)
      expect((await loadActivity(input)).items[0].title).toBe('a.md')
      await recordActivity(database, [
        event(2, {
          title: 'Saved event title',
          path: 'posts/deleted.md',
          kind: 'deleted',
        }),
      ])
      expect((await loadActivity(input)).items[0].title).toBe(
        'Saved event title',
      )
    })

    it('uses fixed-file labels instead of an older captured primary title', async () => {
      await createConfigurationStore({ database }).save(
        'owner',
        'repo',
        'main',
        'fixed-label',
        {
          content: [
            {
              type: 'file',
              name: 'intro',
              label: 'Intro',
              path: 'publications.json',
            },
          ],
        },
      )
      await recordActivity(database, [
        event(1, {
          area: 'file',
          resource: 'intro',
          path: 'publications.json',
          title: 'A publication title',
        }),
      ])
      const data = await loadActivity({
        database,
        cacheDatabase: database,
        access: access(),
        request,
        ...coordinates,
        page: 0,
      })
      expect(data.items[0].title).toBe('Intro')
    })

    it('records configuration creation separately from editing', async () => {
      await withActivityCapture(access(), database, database).execute(
        {
          ...request,
          operation: 'configuration.update',
          target: { ...request.target, path: '.pages.yml' },
          facts: { newFile: true },
        },
        async () => ({ commitSha: 'config-created' }),
      )
      expect(await readActivity(database, coordinates)).toMatchObject([
        { area: 'configuration', kind: 'added' },
      ])
    })

    it('deduplicates uploads without Git revisions by idempotency key', async () => {
      const gateway = withActivityCapture(access(), database, database)
      const mutation: AccessRequest = {
        ...request,
        operation: 'media.write',
        target: { ...request.target, media: 'images' },
      }
      const upload = async () => ({
        path: 'images/new.png',
        revision: null,
        version: 'etag',
      })
      await gateway.executeQuota(mutation, 'upload-one', upload)
      await gateway.executeQuota(mutation, 'upload-one', upload)
      await gateway.executeQuota(mutation, 'upload-two', upload)
      expect(await readActivity(database, coordinates)).toHaveLength(2)
      expect(await readActivity(database, coordinates)).toMatchObject([
        { kind: 'uploaded' },
        { kind: 'uploaded' },
      ])
    })

    it('records each collaborator removal once and retains its subject', async () => {
      const [member] = await database
        .insert(collaboratorTable)
        .values({
          type: 'User',
          installationId: 1,
          ownerId: 1,
          repoId: 2,
          owner: 'owner',
          repo: 'repo',
          email: 'member@example.com',
          name: 'Member',
        })
        .returning({ id: collaboratorTable.id })
      expect(
        await revokeCollaborators(
          database,
          { sql: 'collaborator.repo = ?', args: ['repo'] },
          'Manager',
        ),
      ).toBe(1)
      expect(
        await revokeCollaborators(
          database,
          { sql: 'collaborator.repo = ?', args: ['repo'] },
          'Manager',
        ),
      ).toBe(0)
      // The outer request observer must not replace the service's per-member
      // event with the handler's id-only response.
      await withActivityCapture(access(), database, database).execute(
        {
          ...request,
          operation: 'collaborator.remove',
        },
        async () => ({ id: member.id }),
      )
      expect(await readActivity(database, coordinates)).toMatchObject([
        { kind: 'removed', path: 'Member', actor: 'Manager', branch: '' },
      ])
      expect(await readActivity(database, coordinates)).toHaveLength(1)
    })

    it('reuses stored action runs without exposing workflow inputs or bypassing action permissions', async () => {
      await createConfigurationStore({ database }).save(
        'owner',
        'repo',
        'main',
        'actions-config',
        {
          ...config,
          actions: [{ name: 'build', label: 'Build', workflow: 'build.yml' }],
        },
      )
      await database.insert(actionRunTable).values(
        await repositoryRows(database, {
          owner: 'OWNER',
          repo: 'REPO',
          ref: 'main',
          workflowRef: 'main',
          sha: 'sha',
          actionName: 'build',
          contextType: 'repository',
          workflow: 'build.yml',
          status: 'completed',
          triggeredBy: {
            name: 'Builder',
            email: 'private@example.com',
            image: 'https://profiles.example.test/builder.png',
          },
          payload: { inputs: { secret: 'must-not-return' } },
        }),
      )
      const gateway = access()
      const data = await loadActivity({
        database,
        cacheDatabase: database,
        access: gateway,
        request,
        ...coordinates,
        page: 0,
      })
      expect(data.items).toMatchObject([
        {
          area: 'action',
          kind: 'run',
          actor: 'Builder',
          actorImage: 'https://profiles.example.test/builder.png',
        },
      ])
      expect(JSON.stringify(data)).not.toMatch(
        /must-not-return|private@example.com/,
      )
      gateway.authorize = async (policy) => {
        if (policy.facts?.action === 'build')
          throw new AccessDeniedError({
            allowed: false,
            reason: 'permission_denied',
          })
        return undefined
      }
      expect(
        (
          await loadActivity({
            database,
            cacheDatabase: database,
            access: gateway,
            request,
            ...coordinates,
            page: 0,
          })
        ).items,
      ).toEqual([])
    })

    it.each(['allowed', 'action-denied', 'context-denied'] as const)(
      'uses read permissions for collaborator action activity (%s)',
      async (scenario) => {
        await createConfigurationStore({ database }).save(
          'owner',
          'repo',
          'main',
          'actions-config',
          {
            ...config,
            actions: [{ name: 'build', workflow: 'build.yml' }],
          },
        )
        await database.insert(actionRunTable).values(
          await repositoryRows(database, {
            owner: 'owner',
            repo: 'repo',
            ref: 'main',
            workflowRef: 'main',
            sha: 'sha',
            actionName: 'build',
            contextType: 'entry',
            contextName: 'posts',
            contextPath: 'posts/a.md',
            workflow: 'build.yml',
            status: 'completed',
            triggeredBy: { name: 'Builder' },
            payload: {},
          }),
        )
        const authorize = vi.fn(async (policy: AccessRequest) => {
          const denied =
            (scenario === 'action-denied' &&
              policy.operation === 'action.read') ||
            (scenario === 'context-denied' && policy.operation === 'entry.read')
          return denied
            ? { allowed: false as const, reason: 'permission_denied' as const }
            : { allowed: true as const }
        })
        const principal = { type: 'collaborator' as const, id: 'user' }
        const result = await loadActivity({
          database,
          cacheDatabase: database,
          access: createAccessPolicyGateway({
            required: false,
            policy: { authorize },
          }),
          request: { ...request, principal },
          ...coordinates,
          page: 0,
        })
        expect(result.items).toHaveLength(scenario === 'allowed' ? 1 : 0)
        expect(authorize).toHaveBeenCalledWith(
          expect.objectContaining({
            operation: 'action.read',
            principal,
            facts: { action: 'build' },
          }),
        )
        if (scenario !== 'action-denied')
          expect(authorize).toHaveBeenCalledWith(
            expect.objectContaining({
              operation: 'entry.read',
              principal,
              target: expect.objectContaining({
                collection: 'posts',
                path: 'posts/a.md',
              }),
            }),
          )
      },
    )

    it('paginates 10 at a time and omits inaccessible and no-longer-configured files', async () => {
      await recordActivity(database, [
        ...Array.from({ length: 25 }, (_, i) => event(i)),
        event(30, { path: 'posts/secret.md' }),
        event(31, { path: 'unconfigured/a.md' }),
      ])
      const gateway = access()
      gateway.authorize = async (policy) => {
        if (policy.target?.path === 'posts/secret.md')
          throw new AccessDeniedError({
            allowed: false,
            reason: 'permission_denied',
          })
        return undefined
      }
      const first = await loadActivity({
        database,
        cacheDatabase: database,
        access: gateway,
        request,
        ...coordinates,
        page: 0,
      })
      const last = await loadActivity({
        database,
        cacheDatabase: database,
        access: gateway,
        request,
        ...coordinates,
        page: 2,
      })
      expect(first.items).toHaveLength(10)
      expect(first.hasNext).toBe(true)
      expect(last.items).toHaveLength(5)
      expect(last.hasNext).toBe(false)
      expect(first.items.every((row) => row.path === 'posts/a.md')).toBe(true)
    })

    it('does not expose collaborator information through a repository-read grant', async () => {
      await recordActivity(database, [
        event(1, {
          branch: '',
          area: 'collaborator',
          path: 'private@example.com',
          kind: 'invited',
        }),
      ])
      expect(
        (
          await loadActivity({
            database,
            cacheDatabase: database,
            access: access(),
            request,
            ...coordinates,
            page: 0,
          })
        ).items,
      ).toEqual([])
      expect(
        (
          await loadActivity({
            database,
            cacheDatabase: database,
            access: access(),
            request,
            ...coordinates,
            page: 0,
            canManage: async () => true,
          })
        ).items,
      ).toHaveLength(1)
    })

    it('fails closed when permissions cannot be evaluated', async () => {
      await recordActivity(database, [event(1)])
      const gateway = access()
      gateway.authorize = async () => {
        throw new Error('policy unavailable')
      }
      await expect(
        loadActivity({
          database,
          cacheDatabase: database,
          access: gateway,
          request,
          ...coordinates,
          page: 0,
        }),
      ).rejects.toThrow('policy unavailable')
      expect(
        await database
          .select()
          .from(activityTable)
          .where(
            and(
              eq(activityTable.owner, 'owner'),
              eq(activityTable.repo, 'repo'),
            ),
          ),
      ).toHaveLength(1)
    })
  })
