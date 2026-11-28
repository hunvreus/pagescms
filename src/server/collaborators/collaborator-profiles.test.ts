import { createClient } from '@libsql/client'
import { eq } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLibSqlDatabase } from '#/server/db/client'
import {
  accountTable,
  collaboratorInviteTable,
  collaboratorTable,
  githubInstallationTokenTable,
  userTable,
} from '#/server/db/schema'
import {
  createRepositoryAccessService,
  inviteCollaborators,
  listCollaborators,
} from '../__tests__/credentials'
import type { GitHubApiFactory } from '#/server/github/api'
import type { EmailMessage } from '#/server/email/email'
import { createGitHubApi } from '#/server/github/api'
import { encryptSecret } from '#/server/auth/secret-crypto'
import { revokeCollaborators } from './collaborators'
import * as activityStore from '#/server/activity/store'

const clients: ReturnType<typeof createClient>[] = []
afterEach(() => {
  for (const client of clients.splice(0)) client.close()
})
const manager = {
  id: 'manager',
  name: 'Repository Manager',
  image: 'https://example.com/manager.png',
  email: 'manager@example.com',
  emailVerified: true,
  githubUsername: 'manager',
}
const githubApiFactory: GitHubApiFactory = () => ({
  ...createGitHubApi('test-token', async () => {
    throw new Error('Unexpected GitHub request in collaborator profile test')
  }),
  getRepository: async () => ({
    id: 10,
    ownerId: 20,
    owner: 'pages-cms',
    repo: 'site',
    defaultBranch: 'main',
    private: true,
    canPush: true,
  }),
})
const installationLookup = async () => ({
  id: 30,
  account: { login: 'pages-cms', type: 'Organization' as const },
})

async function fixture() {
  const client = createClient({ url: 'file::memory:' })
  clients.push(client)
  const database = createLibSqlDatabase(client)
  await migrate(database, { migrationsFolder: './drizzle' })
  await database.insert(userTable).values(manager)
  await database.insert(accountTable).values({
    id: 'github-manager',
    userId: manager.id,
    accountId: 'manager',
    providerId: 'github',

    accessToken: 'manager-token',
  })
  const list = () =>
    listCollaborators(
      database,
      manager,
      'pages-cms',
      'site',
      githubApiFactory,
      installationLookup,
    )
  return { database, list }
}

describe('collaborator profiles', () => {
  it('uses the configured language for invitations without a recipient preference', async () => {
    const { database } = await fixture()
    const send = vi.fn(async (_message: EmailMessage) => {})
    await inviteCollaborators({
      database,
      baseUrl: 'http://localhost:3000',
      defaultLanguage: 'es',
      user: manager,
      owner: 'pages-cms',
      repo: 'site',
      emails: ['language@example.com'],
      emailProvider: { send },
      githubApiFactory,
      installationLookup,
    })
    expect(send.mock.calls[0][0].html).toContain('<html lang="es">')
  })
  it('does not delay invitations or removals for activity logging', async () => {
    const { database } = await fixture()
    let release!: () => void
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    const activity = vi
      .spyOn(activityStore, 'recordActivity')
      .mockReturnValue(pending)
    const waitUntil = vi.fn()
    try {
      const [created] = await inviteCollaborators({
        database,
        baseUrl: 'http://localhost:3000',
        user: manager,
        owner: 'pages-cms',
        repo: 'site',
        emails: ['new@example.com'],
        emailProvider: { send: async () => {} },
        githubApiFactory,
        installationLookup,
        waitUntil,
      })
      expect(waitUntil).toHaveBeenCalledTimes(1)
      expect(
        await revokeCollaborators(
          database,
          { sql: 'collaborator.id = ?', args: [created.id] },
          undefined,
          undefined,
          undefined,
          waitUntil,
        ),
      ).toBe(1)
      expect(waitUntil).toHaveBeenCalledTimes(2)
    } finally {
      release()
      await Promise.all(waitUntil.mock.calls.map(([task]) => task))
      activity.mockRestore()
    }
  })

  it.each([false, true])(
    'denies an existing invitee until the role grant finishes (revoked: %s)',
    async (revoked) => {
      const { database } = await fixture()
      const invitee = {
        id: 'invitee',
        name: 'Invitee',
        email: 'invitee@example.com',
        emailVerified: true,
        githubUsername: null,
      }
      await database.insert(userTable).values(invitee)
      const cryptoKey = btoa(
        String.fromCharCode(...new Uint8Array(32).fill(17)),
      )
      await database.insert(githubInstallationTokenTable).values({
        installationId: 30,
        ...(await encryptSecret('installation-token', cryptoKey)),
        expiresAt: new Date(Date.now() + 600_000),
      })
      const admission = () =>
        createRepositoryAccessService({
          database,
          cacheDatabase: database,
          githubApp: { appId: '1', privateKey: 'cached-only', cryptoKey },
          githubApiFactory,
        }).resolve(invitee, 'pages-cms', 'site')
      let release!: () => void
      const grant = new Promise<void>((resolve) => {
        release = resolve
      })
      let entered!: () => void
      const pending = new Promise<void>((resolve) => {
        entered = resolve
      })
      const send = vi.fn(async () => undefined)
      const invitation = inviteCollaborators({
        database,
        baseUrl: 'http://localhost:3000',
        user: manager,
        owner: 'pages-cms',
        repo: 'site',
        emails: [invitee.email],
        githubApiFactory,
        installationLookup,
        emailProvider: { send },
        afterCreate: async () => {
          entered()
          await grant
        },
      })
      await pending
      try {
        await expect(admission()).rejects.toThrow('do not have permission')
        const membership = await database.query.collaboratorTable.findFirst()
        expect(membership?.pending).toBe(true)
        if (revoked)
          await revokeCollaborators(database, {
            sql: 'collaborator.id = ?',
            args: [membership!.id],
          })
      } finally {
        release()
        if (revoked)
          await expect(invitation).rejects.toThrow('invitation was revoked')
        else await invitation
      }
      if (revoked) {
        await expect(admission()).rejects.toThrow('do not have permission')
        expect(send).not.toHaveBeenCalled()
        return
      }
      expect(send).toHaveBeenCalledOnce()
      expect((await admission()).tokenSource).toBe('installation')
      expect(
        (await database.query.collaboratorTable.findFirst())?.pending,
      ).toBe(false)
    },
  )

  it('emails a repository link without creating a token or expiry', async () => {
    const { database, list } = await fixture()
    const send = vi.fn(async (_message: { text?: string }) => {})
    const added = await inviteCollaborators({
      database,
      baseUrl: 'http://localhost:3000',
      user: manager,
      owner: 'pages-cms',
      repo: 'site',
      emails: ['new@example.com'],
      emailProvider: { send },
      githubApiFactory,
      installationLookup,
    })
    expect(added[0].inviteExpiresAt).toBeNull()
    expect(await database.select().from(collaboratorInviteTable)).toEqual([])
    expect(send.mock.calls[0][0].text).toContain(
      'http://localhost:3000/github/pages-cms/site',
    )
    expect((await list())[0].inviteExpiresAt).toBeNull()
  })
  it('shows current linked profiles, preserves pending identities and excludes removed members', async () => {
    const { database, list } = await fixture()
    await database.insert(userTable).values([
      {
        id: 'alice',
        name: 'Alice Editor',
        email: 'alice@example.com',
        image: 'https://example.com/alice.png',
        emailVerified: true,
      },
      {
        id: 'bob',
        name: 'Bob Editor',
        email: 'bob@example.com',
        githubUsername: 'bob-editor',
        emailVerified: true,
      },
      {
        id: 'pending',
        name: 'Unverified Person',
        email: 'pending@example.com',
        image: 'https://example.com/pending.png',
      },
    ])
    const scope = {
      type: 'org',
      installationId: 30,
      ownerId: 20,
      repoId: 10,
      owner: 'pages-cms',
      repo: 'site',
    }
    await database.insert(collaboratorTable).values([
      {
        ...scope,
        email: 'alice@example.com',
        name: 'Outdated invitation name',
        userId: 'alice',
      },
      { ...scope, email: 'bob@example.com', userId: 'bob' },
      { ...scope, email: 'pending@example.com' },
      {
        ...scope,
        repoId: 11,
        repo: 'another-site',
        email: 'elsewhere@example.com',
        userId: 'alice',
      },
    ])
    expect(await list()).toEqual([
      {
        id: expect.any(Number),
        email: 'alice@example.com',
        name: 'Alice Editor',
        userId: 'alice',
        image: 'https://example.com/alice.png',
        inviteExpiresAt: null,
      },
      {
        id: expect.any(Number),
        email: 'bob@example.com',
        name: 'Bob Editor',
        userId: 'bob',
        image: null,
        inviteExpiresAt: null,
      },
      {
        id: expect.any(Number),
        email: 'pending@example.com',
        name: null,
        userId: null,
        image: null,
        inviteExpiresAt: null,
      },
    ])
    await database
      .update(userTable)
      .set({ name: 'Alice Renamed', image: 'https://example.com/new.png' })
      .where(eq(userTable.id, 'alice'))
    expect((await list())[0]).toMatchObject({
      name: 'Alice Renamed',
      image: 'https://example.com/new.png',
    })
  })

  it('adds an existing verified account immediately, including self-invites, with its profile', async () => {
    const { database, list } = await fixture()
    const added = await inviteCollaborators({
      database,
      baseUrl: 'http://localhost:3000',
      user: manager,
      owner: 'pages-cms',
      repo: 'site',
      emails: ['MANAGER@example.com'],
      githubApiFactory,
      installationLookup,
    })
    expect(added).toEqual([
      {
        id: expect.any(Number),
        email: manager.email,
        name: manager.name,
        image: manager.image,
        userId: manager.id,
        inviteExpiresAt: null,
      },
    ])
    expect(await list()).toEqual(added)
    expect(await database.select().from(collaboratorInviteTable)).toEqual([])
  })
})
