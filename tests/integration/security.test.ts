import { eq, sql } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createDatabase } from '#/server/db/client'
import { registerAtomicExecutor } from '#/server/db/core'
import {
  collaboratorInviteTable,
  collaboratorTable,
  githubInstallationTokenTable,
  userTable,
} from '#/server/db/schema'
import {
  listActiveMemberships,
  revokeCollaborators,
} from '#/server/collaborators/collaborators'
import {
  createRepositoryService,
  createRepositoryAccessService,
  inviteCollaborators,
  listCollaborators,
  removeCollaborator,
} from '#/server/__tests__/credentials'
import { handleGitHubWebhook } from '#/server/github/webhook'
import { encryptSecret } from '#/server/auth/secret-crypto'
import { observeRepositoryIdentity } from '#/server/access/repository-identity'
import type { Database } from '#/server/db/client'
import type { GitHubApi } from '#/server/github/api'
import type { Client } from '@libsql/client'

const url = process.env.TEST_DATABASE_URL
const integration = url ? describe : describe.skip
const database = url ? createDatabase({ url }) : null
const token = 'a'.repeat(43)
const user = {
  id: 'security-editor',
  name: 'Editor',
  email: 'security@example.com',
  emailVerified: true,
  githubUsername: null,
}
const coordinates = { owner: 'security-owner', repo: 'security-repo' }
const api = {
  getRepository: vi
    .fn()
    .mockResolvedValue({ ...coordinates, id: 10, ownerId: 20, canPush: true }),
  listInstallations: vi
    .fn()
    .mockResolvedValue([
      { id: 30, account: { login: coordinates.owner, type: 'User' } },
    ]),
  listInstallationRepositories: vi
    .fn()
    .mockResolvedValue([{ owner: coordinates.owner, name: coordinates.repo }]),
} as unknown as GitHubApi

async function asManager<T>(operation: () => Promise<T>) {
  const lookup = vi
    .spyOn(database!.query.accountTable, 'findFirst')
    .mockResolvedValue({ accessToken: 'manager-token' } as never)
  try {
    return await operation()
  } finally {
    lookup.mockRestore()
  }
}

function remove(id: number) {
  return removeCollaborator({
    database: database!,
    user: { ...user, githubUsername: 'manager' },
    ...coordinates,
    id,
    githubApiFactory: () => api,
  })
}

function reinvite() {
  return inviteCollaborators({
    database: database!,
    emailProvider: { send: vi.fn(async () => undefined) },
    baseUrl: 'https://cms.example.com',
    user: { ...user, githubUsername: 'manager' },
    ...coordinates,
    emails: [user.email],
    githubApiFactory: () => api,
  })
}

integration('security boundaries against SQLite', () => {
  beforeEach(async () => {
    await database!.delete(collaboratorInviteTable)
    await database!.delete(collaboratorTable)
    await database!.delete(githubInstallationTokenTable)
    await database!
      .insert(userTable)
      .values(user)
      .onConflictDoUpdate({
        target: userTable.id,
        set: { emailVerified: true },
      })
    await observeRepositoryIdentity(database!, {
      id: 10,
      ownerId: 20,
      ...coordinates,
    })
    await database!.insert(collaboratorTable).values({
      ...coordinates,
      type: 'user',
      installationId: 30,
      ownerId: 20,
      repoId: 10,
      email: user.email,
    })
    await database!.insert(collaboratorInviteTable).values({
      repoId: 10,
      ...coordinates,
      email: user.email,
      token,
      expiresAt: new Date(Date.now() + 60_000),
    })
  })

  it('limits active memberships to the requested repository identity', async () => {
    const members = await listActiveMemberships(
      database!,
      coordinates.owner.toUpperCase(),
      coordinates.repo,
      '10',
    )
    expect(members).toMatchObject([{ email: user.email, userId: null }])
    await expect(
      listActiveMemberships(
        database!,
        coordinates.owner,
        coordinates.repo,
        '11',
      ),
    ).resolves.toEqual([])
  })

  it('deletes removed memberships without exposing repositories or reusing a warm installation token', async () => {
    const [original] = await database!.select().from(collaboratorTable)
    const cryptoKey = btoa(String.fromCharCode(...new Uint8Array(32).fill(31)))
    await database!.insert(githubInstallationTokenTable).values({
      installationId: 30,
      ...(await encryptSecret('cached-installation-token', cryptoKey)),
      expiresAt: new Date(Date.now() + 600_000),
    })
    const accessInput = {
      database: database!,
      cacheDatabase: database!,
      githubApp: { appId: '123', privateKey: 'cached-token-only', cryptoKey },
      githubApiFactory: () => api,
    }
    const access = createRepositoryAccessService(accessInput)
    await expect(
      access.resolve(user, coordinates.owner, coordinates.repo, 'main'),
    ).resolves.toMatchObject({ tokenSource: 'installation' })

    await asManager(() => remove(original.id))
    expect(await database!.select().from(collaboratorTable)).toEqual([])
    const operation = vi.fn(async () => undefined)
    await expect(
      access.executeMutation(
        user,
        { ...coordinates, branch: 'main' },
        'single',
        operation,
      ),
    ).rejects.toThrow('permission')
    expect(operation).not.toHaveBeenCalled()
    for (const emailVerified of [true, false]) {
      const viewer = { ...user, emailVerified }
      const freshAccess = createRepositoryAccessService(accessInput)
      await expect(
        freshAccess.resolve(
          viewer,
          coordinates.owner,
          coordinates.repo,
          'main',
        ),
      ).rejects.toThrow('permission')
      const projects = createRepositoryService(
        database!,
        database!,
        freshAccess,
      )
      expect((await projects.getAccountAccess(viewer)).accounts).toEqual([])
      expect(
        await projects.listRepositories(
          viewer,
          {
            login: coordinates.owner,
            type: 'user',
            repositorySelection: 'selected',
            installationId: 30,
          },
          '',
        ),
      ).toEqual([])
    }
    await asManager(async () => {
      expect(
        await listCollaborators(
          database!,
          { ...user, githubUsername: 'manager' },
          coordinates.owner,
          coordinates.repo,
          () => api,
        ),
      ).toEqual([])
      await expect(remove(original.id)).rejects.toThrow('not found')
    })
    expect(await database!.select().from(collaboratorTable)).toEqual([])
  })

  it.each([true, false])(
    'creates a new membership on reinvitation without resetting the old record (verified: %s)',
    async (verified) => {
      const [original] = await database!.select().from(collaboratorTable)
      await asManager(() => remove(original.id))
      await database!
        .update(userTable)
        .set({ emailVerified: verified })
        .where(eq(userTable.id, user.id))
      const started = Date.now()
      const [fresh] = await asManager(reinvite)
      const rows = await database!
        .select()
        .from(collaboratorTable)
        .orderBy(collaboratorTable.id)
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({
        id: fresh.id,
        userId: verified ? user.id : null,
      })
      expect(rows[0].createdAt!.getTime()).toBeGreaterThanOrEqual(started)
      expect(fresh.id).not.toBe(original.id)
      expect(await database!.select().from(collaboratorInviteTable)).toEqual([])
    },
  )

  it('cannot revoke a fresh invitation when another request removes and reinvites after the old membership was read', async () => {
    const [original] = await database!.select().from(collaboratorTable)
    await database!
      .update(userTable)
      .set({ emailVerified: false })
      .where(eq(userTable.id, user.id))
    const client = (database! as Database & { $client: Client }).$client
    const lookup = client.execute.bind(client)
    let interrupted = false
    const interruptedLookup = async (...args: Parameters<typeof lookup>) => {
      const found = await lookup(...args)
      const statement = args[0] as unknown as string | { sql: string }
      const query = typeof statement === 'string' ? statement : statement.sql
      if (
        !interrupted &&
        query.startsWith(
          'SELECT id, email, user_id AS userId FROM collaborator',
        )
      ) {
        interrupted = true
        await revokeCollaborators(database!, {
          sql: 'collaborator.id = ?',
          args: [original.id],
        })
        await reinvite()
      }
      return found
    }
    const spy = vi
      .spyOn(client, 'execute')
      .mockImplementation(interruptedLookup)
    try {
      await asManager(() =>
        expect(remove(original.id)).rejects.toThrow('not found'),
      )
      const active = await database!.select().from(collaboratorTable)
      expect(active).toHaveLength(1)
      expect(active[0].id).not.toBe(original.id)
      expect(await database!.select().from(collaboratorInviteTable)).toEqual([])
    } finally {
      spy.mockRestore()
    }
  })

  it('does not expose pending repositories or admit unverified emails', async () => {
    const access = createRepositoryAccessService({
      database: database!,
      cacheDatabase: database!,
      githubApp: undefined,
    })
    const projects = createRepositoryService(database!, database!, access)
    for (const emailVerified of [false, undefined]) {
      const unverified = { ...user, emailVerified }
      expect((await projects.getAccountAccess(unverified)).accounts).toEqual([])
      await expect(
        access.resolve(unverified, coordinates.owner, coordinates.repo, 'main'),
      ).rejects.toThrow('permission')
    }
    expect((await projects.getAccountAccess(user)).accounts).toHaveLength(1)
    await database!.update(collaboratorTable).set({ userId: user.id })
    expect(
      (await projects.getAccountAccess({ ...user, emailVerified: false }))
        .accounts,
    ).toHaveLength(1)
  })

  it('rolls back collaborator removal if invite deletion fails', async () => {
    const rows = await database!.select().from(collaboratorTable)
    await database!.run(
      sql`CREATE TRIGGER security_delete_failure BEFORE DELETE ON collaborator_invite BEGIN SELECT RAISE(ABORT, 'simulated failure'); END`,
    )
    const accountLookup = vi
      .spyOn(database!.query.accountTable, 'findFirst')
      .mockResolvedValue({ accessToken: 'token' } as never)
    try {
      await expect(
        removeCollaborator({
          database: database!,
          user: { ...user, githubUsername: 'manager' },
          ...coordinates,
          id: rows[0].id,
          githubApiFactory: () => api,
        }),
      ).rejects.toThrow()
      expect(await database!.select().from(collaboratorTable)).toHaveLength(1)
      expect(
        await database!.select().from(collaboratorInviteTable),
      ).toHaveLength(1)
    } finally {
      await database!.run(sql`DROP TRIGGER security_delete_failure`)
      accountLookup.mockRestore()
    }
  })

  it('revokes installation access before cache cleanup, allowing retries', async () => {
    const cache = {} as Database
    registerAtomicExecutor(cache, async () => {
      throw new Error('cache unavailable')
    })
    const payload = {
      action: 'deleted',
      installation: { id: 30, account: { login: coordinates.owner } },
    }
    await expect(
      handleGitHubWebhook(database!, 'installation', payload, undefined, cache),
    ).rejects.toThrow('cache unavailable')
    expect(await database!.select().from(collaboratorTable)).toEqual([])
    expect(await database!.select().from(collaboratorInviteTable)).toHaveLength(
      0,
    )
    await handleGitHubWebhook(database!, 'installation', payload)
    expect(await database!.select().from(collaboratorTable)).toEqual([])
  })

  it('removes pending invitations together with repositories removed from an installation', async () => {
    await handleGitHubWebhook(database!, 'installation_repositories', {
      action: 'removed',
      repositories_removed: [
        { id: 10, full_name: 'security-owner/security-repo' },
      ],
    })
    expect(await database!.select().from(collaboratorTable)).toEqual([])
    expect(await database!.select().from(collaboratorInviteTable)).toHaveLength(
      0,
    )
  })

  it.each(['deleted', 'transferred'])(
    'deletes revoked memberships and removes invitations on repository %s',
    async (action) => {
      await handleGitHubWebhook(
        database!,
        'repository',
        {
          action,
          repository: {
            id: 10,
            name: coordinates.repo,
            owner: {
              id: action === 'transferred' ? 21 : 20,
              login: coordinates.owner,
            },
          },
          installation: { id: 30 },
          changes: { owner: { from: { login: coordinates.owner } } },
        },
        async () =>
          ({
            getRepository: async () => ({
              id: 10,
              ownerId: 21,
              ...coordinates,
            }),
          }) as unknown as GitHubApi,
      )

      expect(await database!.select().from(collaboratorTable)).toEqual([])
      expect(
        await database!.select().from(collaboratorInviteTable),
      ).toHaveLength(0)
    },
  )

  it('does not email an invitation if the membership insert fails', async () => {
    await database!.run(
      sql`CREATE TRIGGER security_insert_failure BEFORE INSERT ON collaborator BEGIN SELECT RAISE(ABORT, 'simulated failure'); END`,
    )
    const accountLookup = vi
      .spyOn(database!.query.accountTable, 'findFirst')
      .mockResolvedValue({ accessToken: 'token' } as never)
    const send = vi.fn()
    try {
      await expect(
        inviteCollaborators({
          database: database!,
          emailProvider: { send },
          baseUrl: 'https://cms.example.com',
          user: { ...user, githubUsername: 'manager' },
          ...coordinates,
          emails: ['new-editor@example.com'],
          githubApiFactory: () => api,
        }),
      ).rejects.toThrow()
      expect(await database!.select().from(collaboratorTable)).toHaveLength(1)
      expect(send).not.toHaveBeenCalled()
    } finally {
      await database!.run(sql`DROP TRIGGER security_insert_failure`)
      accountLookup.mockRestore()
    }
  })
})
