import { sql } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createDatabase } from '#/server/database/client.server'
import {
  collaboratorInviteTable,
  collaboratorTable,
  userTable,
} from '#/server/database/schema'
import {
  acceptCollaboratorInvite,
  collaboratorInviteStatus,
  inviteCollaborators,
  removeCollaborator,
} from '#/server/collaborator-service.server'
import { createProjectService } from '#/server/projects.server'
import { createRepositoryAccessService } from '#/server/repository-access.server'
import { handleGitHubWebhook } from '#/server/github-webhook.server'
import type { Database } from '#/server/database/client.server'
import type { GitHubApi } from '#/server/github-api.server'

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

integration('security boundaries against SQLite', () => {
  beforeEach(async () => {
    await database!.delete(collaboratorInviteTable)
    await database!.delete(collaboratorTable)
    await database!.insert(userTable).values(user).onConflictDoNothing()
    await database!.insert(collaboratorTable).values({
      ...coordinates,
      type: 'user',
      installationId: 30,
      ownerId: 20,
      repoId: 10,
      email: user.email,
      branch: 'main',
    })
    await database!.insert(collaboratorInviteTable).values({
      ...coordinates,
      email: user.email,
      token,
      expiresAt: new Date(Date.now() + 60_000),
    })
  })

  it('does not expose pending repositories or admit unverified emails', async () => {
    const access = createRepositoryAccessService({
      database: database!,
      cacheDatabase: database!,
      githubApp: undefined,
    })
    const projects = createProjectService(database!, database!, access)
    for (const emailVerified of [false, undefined]) {
      const unverified = { ...user, emailVerified }
      expect(await projects.listAccounts(unverified)).toEqual([])
      await expect(
        access.resolve(unverified, coordinates.owner, coordinates.repo, 'main'),
      ).rejects.toThrow('permission')
    }
    expect(await projects.listAccounts(user)).toHaveLength(1)
    await database!.update(collaboratorTable).set({ userId: user.id })
    expect(
      await projects.listAccounts({ ...user, emailVerified: false }),
    ).toHaveLength(1)
  })

  it('keeps invitation reads pure and masks the unauthenticated response', async () => {
    expect(await collaboratorInviteStatus(database!, token)).not.toHaveProperty(
      'email',
    )
    expect(
      await collaboratorInviteStatus(database!, token, user),
    ).toMatchObject({ status: 'ready' })
    expect(
      (await database!.select().from(collaboratorTable))[0].userId,
    ).toBeNull()
    expect(await database!.select().from(collaboratorInviteTable)).toHaveLength(
      1,
    )
    await database!
      .update(collaboratorInviteTable)
      .set({ expiresAt: new Date(0) })
    expect(await collaboratorInviteStatus(database!, token, user)).toEqual({
      status: 'unavailable',
    })
    expect(await database!.select().from(collaboratorInviteTable)).toHaveLength(
      1,
    )
    await expect(
      acceptCollaboratorInvite(database!, token, user),
    ).rejects.toThrow('cannot be accepted')
  })

  it('accepts only a verified matching account and consumes the invite atomically', async () => {
    await expect(
      acceptCollaboratorInvite(database!, token, {
        ...user,
        emailVerified: false,
      }),
    ).rejects.toThrow('cannot be accepted')
    await expect(
      acceptCollaboratorInvite(database!, token, {
        ...user,
        email: 'other@example.com',
      }),
    ).rejects.toThrow('cannot be accepted')
    expect(
      await acceptCollaboratorInvite(database!, token, user),
    ).toMatchObject({ status: 'ready' })
    expect((await database!.select().from(collaboratorTable))[0].userId).toBe(
      user.id,
    )
    expect(await database!.select().from(collaboratorInviteTable)).toHaveLength(
      0,
    )
    await expect(
      acceptCollaboratorInvite(database!, token, user),
    ).rejects.toThrow('cannot be accepted')
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

  it('rejects acceptance if the invitation is revoked after its status was read', async () => {
    const lookup = database!.query.collaboratorInviteTable.findFirst.bind(
      database!.query.collaboratorInviteTable,
    )
    let reads = 0
    const interruptedLookup = async (...args: Parameters<typeof lookup>) => {
      const invite = await lookup(...args)
      if (++reads === 2) await database!.delete(collaboratorInviteTable)
      return invite
    }
    // This caller only awaits the relational query; the interruption retains
    // its result shape while substituting an ordinary promise for the query.
    const spy = vi
      .spyOn(database!.query.collaboratorInviteTable, 'findFirst')
      .mockImplementation(interruptedLookup as unknown as typeof lookup)
    try {
      await expect(
        acceptCollaboratorInvite(database!, token, user),
      ).rejects.toThrow('Invitation unavailable')
      expect(
        (await database!.select().from(collaboratorTable))[0].userId,
      ).toBeNull()
    } finally {
      spy.mockRestore()
    }
  })

  it('revokes installation access before cache cleanup, allowing retries', async () => {
    const cache = {
      delete: () => {
        throw new Error('cache unavailable')
      },
    } as unknown as Database
    const payload = {
      action: 'deleted',
      installation: { id: 30, account: { login: coordinates.owner } },
    }
    await expect(
      handleGitHubWebhook(database!, 'installation', payload, undefined, cache),
    ).rejects.toThrow('cache unavailable')
    expect(await database!.select().from(collaboratorTable)).toHaveLength(0)
    expect(await database!.select().from(collaboratorInviteTable)).toHaveLength(
      0,
    )
    await handleGitHubWebhook(database!, 'installation', payload)
  })

  it('removes pending invitations together with repositories removed from an installation', async () => {
    await handleGitHubWebhook(database!, 'installation_repositories', {
      action: 'removed',
      repositories_removed: [
        { id: 10, full_name: 'security-owner/security-repo' },
      ],
    })
    expect(await database!.select().from(collaboratorTable)).toHaveLength(0)
    expect(await database!.select().from(collaboratorInviteTable)).toHaveLength(
      0,
    )
  })

  it('rolls back invitation creation if the invite insert fails', async () => {
    await database!.run(
      sql`CREATE TRIGGER security_insert_failure BEFORE INSERT ON collaborator_invite BEGIN SELECT RAISE(ABORT, 'simulated failure'); END`,
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
