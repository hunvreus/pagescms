import { withRepositoryPolicyIdentity } from '#/server/access/repository-identity-policy'
import { createAccessPolicyGateway } from '#/server/access/policy'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { eq, sql } from 'drizzle-orm'
import { createClient } from '@libsql/client'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { createLibSqlDatabase } from '#/server/db/client'
import {
  observeRepositoryIdentity,
  findRepositoryIdentity,
  repositoryPolicyIdentityFromRow,
  findRepositoryIdentityByExternalId,
  ensureRepositoryIdentity,
  searchRepositoryIdentities,
} from '#/server/access/repository-identity'
import * as repositoryIdentity from '#/server/access/repository-identity'
import { createRepositoryAccessService } from '#/server/__tests__/credentials'
import { createRepositoryAccessService as createProductionAccess } from '#/server/access/repository'
import { createGitHubAccountReader } from '#/server/auth/oauth-account'
import { encryptOAuthToken } from '#/server/auth/oauth-token-crypto'
import { createConfigurationStore } from '#/server/cache/configuration'
import {
  createDirectoryCache,
  invalidateDirectoryCache,
} from '#/server/cache/directory'
import { handleGitHubWebhook } from '#/server/github/webhook'
import {
  cacheFileTable,
  cacheFileMetaTable,
  collaboratorTable,
  collaboratorInviteTable,
  actionRunTable,
  activityTable,
  userTable,
  accountTable,
  githubInstallationTokenTable,
  repositoryTable,
  repositoryAddressTable,
} from '#/server/db/schema'
import { recordActivity, readActivity } from '#/server/activity/store'
import { readActionRunStatuses } from '#/server/actions/actions'
import { repositoryRows } from '../../../tests/repository-fixture'
import { createGitHubApi, GitHubApiError } from '#/server/github/api'
import { resolveRepositoryPrincipal } from '#/server/access/repository-policy'
import { readCollection } from '#/server/services/content'
import { loadRawEntry } from '#/server/content/entry-editor'
import type { ServiceContext } from '#/server/services/context'
import { encryptSecret } from '#/server/auth/secret-crypto'
import type { GitHubApi } from '#/server/github/api'
import type { Database } from '#/server/db/client'

const clients: ReturnType<typeof createClient>[] = []
afterEach(() => {
  for (const client of clients.splice(0)) client.close()
})
async function fixture() {
  const client = createClient({ url: 'file::memory:' })
  clients.push(client)
  const database = createLibSqlDatabase(client)
  await migrate(database, { migrationsFolder: './drizzle' })
  const original = {
    id: 7001,
    ownerId: 8001,
    owner: 'original-owner',
    repo: 'original-repo',
  }
  await observeRepositoryIdentity(database, original)
  const config = createConfigurationStore({ database })
  await config.save(original.owner, original.repo, 'main', 'configuration', {
    content: [],
  })
  return { database, original, config }
}

async function editor(database: Database, id: string, token?: string) {
  const user = {
    id,
    name: 'Editor',
    email: `${id}@example.com`,
    emailVerified: true,
    githubUsername: id,
  }
  await database.insert(userTable).values(user)
  if (token)
    await database.insert(accountTable).values({
      id: `${id}-account`,
      accountId: id,

      providerId: 'github',
      userId: id,
      accessToken: token,
    })
  return user
}

function fakeApi(metadata?: {
  id: number
  owner: string
  repo: string
  ownerId?: number
}) {
  return {
    source: 'github.com',
    getRepository: vi.fn(async (owner: string, repo: string) => {
      if (!metadata) throw new GitHubApiError('Not Found', 404)
      return {
        ownerId: 8200,
        defaultBranch: 'main',
        private: true,
        canPush: true,
        ...metadata,
        ...(metadata.owner ? {} : { owner, repo }),
      }
    }),
    putFile: vi.fn(async (input: { owner: string; repo: string }) => ({
      path: 'a.md',
      sha: 'saved',
      commitSha: `${input.owner}/${input.repo}`,
    })),
  }
}

async function identityRows(database: Database) {
  return [
    (await database.select().from(repositoryTable)).length,
    (await database.select().from(repositoryAddressTable)).length,
  ]
}

describe('stable repository identity', () => {
  it('observes an unchanged identity in one database read', async () => {
    const { database, original } = await fixture()
    const execute = vi.spyOn(clients[clients.length - 1], 'execute')
    const result = await observeRepositoryIdentity(database, original, original)
    expect(result.externalId).toBe(String(original.id))
    expect(execute).toHaveBeenCalledTimes(1)
  })

  it('carries the cache database scope independently of the application scope', async () => {
    const { database, original } = await fixture()
    const client = createClient({ url: 'file::memory:' })
    clients.push(client)
    const cacheDatabase = createLibSqlDatabase(client)
    await migrate(cacheDatabase, { migrationsFolder: './drizzle' })
    await observeRepositoryIdentity(cacheDatabase, {
      id: 999,
      ownerId: 999,
      owner: 'other',
      repo: 'other',
    })
    const secret = 'split-database-test-secret-with-32-characters'
    const user = await editor(
      database,
      'separate-scopes',
      await encryptOAuthToken('token', secret),
    )
    const api = fakeApi(original)
    const access = createProductionAccess({
      database,
      cacheDatabase,
      githubApp: undefined,
      githubApiFactory: () => api as unknown as GitHubApi,
      readGitHubAccount: createGitHubAccountReader(database, secret),
    })
    const admission = await access.resolve(user, original.owner, original.repo)
    const applicationRow = await findRepositoryIdentity(database, original)
    const cacheRow = await findRepositoryIdentity(cacheDatabase, original)
    expect(applicationRow?.id).not.toBe(cacheRow?.id)
    expect(admission.identity).toMatchObject({
      applicationId: applicationRow?.id,
      cacheId: cacheRow?.id,
      externalId: String(original.id),
    })
    const config = createConfigurationStore({ database: cacheDatabase })
    await config.save(original.owner, original.repo, 'main', 'sha', {
      content: [{ name: 'posts', type: 'collection', path: 'posts' }],
    })
    await expect(
      config.get(
        admission.api,
        original.owner,
        original.repo,
        'main',
        String(original.id),
        {
          id: admission.identity!.cacheId,
          externalId: admission.identity!.externalId,
          source: admission.identity!.source,
        },
      ),
    ).resolves.toMatchObject({ repositoryId: cacheRow?.id })
    await expect(
      loadRawEntry({
        database: cacheDatabase,
        repositoryAccess: {
          resolve: async () => ({
            ...admission,
            api: {
              ...admission.api,
              getFile: async () => ({
                sha: 'entry-sha',
                content: btoa('hello'),
              }),
            },
          }),
        },
        user,
        owner: original.owner,
        repo: original.repo,
        branch: 'main',
        name: 'posts',
        path: 'posts/a.md',
      }),
    ).resolves.toMatchObject({ sha: 'entry-sha', source: 'hello' })
  })

  it('uses the admitted cache scope without another identity read and rejects a mismatched source or ID', async () => {
    const { database, original, config } = await fixture()
    const row = await findRepositoryIdentity(database, original)
    expect(row).toBeTruthy()
    const lookup = vi.spyOn(
      repositoryIdentity,
      'findRepositoryIdentityByExternalId',
    )
    const api = { source: 'github.com' } as GitHubApi
    const scope = {
      id: row!.id,
      externalId: String(original.id),
      source: 'github.com',
    }
    try {
      await expect(
        config.get(
          api,
          original.owner,
          original.repo,
          'main',
          scope.externalId,
          scope,
        ),
      ).resolves.toMatchObject({ repositoryId: row!.id })
      expect(lookup).not.toHaveBeenCalled()
      await expect(
        config.get(
          api,
          original.owner,
          original.repo,
          'main',
          'different',
          scope,
        ),
      ).rejects.toThrow('identity changed')
      await expect(
        config.get(
          api,
          original.owner,
          original.repo,
          'main',
          scope.externalId,
          { ...scope, source: 'other' },
        ),
      ).rejects.toThrow('identity changed')
    } finally {
      lookup.mockRestore()
    }
  })

  it('skips policy identity reads only when neither an extension nor a pinned ID needs them', async () => {
    const { database, original } = await fixture()
    const gateway = createAccessPolicyGateway({ required: false })
    const request = {
      operation: 'repository.read' as const,
      principal: { type: 'user' as const, id: 'reader' },
      tenant: {
        type: 'repository' as const,
        id: 'original-owner/original-repo',
      },
      target: { repository: { owner: original.owner, repo: original.repo } },
    }
    const lookup = vi.spyOn(repositoryIdentity, 'findRepositoryIdentity')
    try {
      await withRepositoryPolicyIdentity(gateway, database, false).authorize(
        request,
      )
      expect(lookup).not.toHaveBeenCalled()
      await expect(
        withRepositoryPolicyIdentity(gateway, database, false).authorize({
          ...request,
          target: {
            repository: { ...request.target.repository, repoId: 'wrong' },
          },
        }),
      ).rejects.toThrow('repository at this address changed')
      expect(lookup).toHaveBeenCalledOnce()
    } finally {
      lookup.mockRestore()
    }
  })

  it('requires an owner identity only for configured extension policies', async () => {
    const { database } = await fixture()
    const repository = { owner: 'imported', repo: 'repository', id: '9000' }
    await observeRepositoryIdentity(database, repository)
    const request = {
      operation: 'repository.read' as const,
      principal: { type: 'user' as const, id: 'reader' },
      tenant: { type: 'repository' as const, id: 'imported/repository' },
      target: {
        repository: {
          owner: repository.owner,
          repo: repository.repo,
          repoId: repository.id,
        },
        branch: 'main',
      },
    }
    const gateway = createAccessPolicyGateway({ required: false })
    await expect(
      withRepositoryPolicyIdentity(gateway, database, false).authorize(request),
    ).resolves.toEqual(await gateway.authorize(request))
    await expect(
      withRepositoryPolicyIdentity(gateway, database, true).authorize(request),
    ).rejects.toThrow('Verified repository identity')
    await expect(
      withRepositoryPolicyIdentity(gateway, database, false).authorize({
        ...request,
        target: {
          ...request.target,
          repository: { ...request.target.repository, repoId: 'different' },
        },
      }),
    ).rejects.toThrow('repository at this address changed')
  })

  it('does not create repository identities for denied read requests', async () => {
    const { database } = await fixture()
    const access = createRepositoryAccessService({
      database,
      cacheDatabase: database,
      githubApp: undefined,
    })
    const address = { owner: 'unadmitted-owner', repo: 'unadmitted-repo' }
    await expect(
      access.resolve(
        {
          id: 'unknown-user',
          email: 'unknown@example.test',
          githubUsername: null,
        },
        address.owner,
        address.repo,
      ),
    ).rejects.toThrow('permission')
    expect(await findRepositoryIdentity(database, address)).toBeNull()
  })

  it('retains the admitted identity between policy decisions when an address is reused', async () => {
    const { database, original } = await fixture()
    const policy = withRepositoryPolicyIdentity(
      createAccessPolicyGateway({ required: false }),
      database,
      true,
    )
    const request = {
      operation: 'repository.read' as const,
      principal: {
        type: 'user' as const,
        id: 'reader',
        repositoryIdentity: {
          source: 'github.com',
          externalId: String(original.id),
          ownerId: String(original.ownerId),
        },
      },
      tenant: {
        type: 'repository' as const,
        id: 'original-owner/original-repo',
      },
      target: {
        repository: {
          owner: original.owner,
          repo: original.repo,
          repoId: String(original.id),
        },
        branch: 'main',
      },
    }
    await expect(policy.authorize(request)).resolves.toMatchObject({
      policyVersion: 'default-access-v1',
    })
    await observeRepositoryIdentity(database, { ...original, id: 7009 })
    await expect(policy.authorize(request)).resolves.toMatchObject({
      policyVersion: 'default-access-v1',
    })
  })

  it('does not restore an old address mapping from cached GitHub metadata', async () => {
    const { database, original } = await fixture()
    const user = await editor(
      database,
      'cached-identity',
      'cached-identity-token',
    )
    let current = original
    const fetcher = vi.fn(async () =>
      Response.json({
        id: current.id,
        name: current.repo,
        owner: { id: current.ownerId, login: current.owner },
        default_branch: 'main',
        private: true,
        permissions: { push: true },
      }),
    )
    const services = () =>
      createRepositoryAccessService({
        database,
        cacheDatabase: database,
        githubApp: undefined,
        githubApiFactory: (token) => createGitHubApi(token, fetcher),
      })
    await services().resolve(user, original.owner, original.repo)
    current = { ...original, id: 7009 }
    await observeRepositoryIdentity(database, current)
    await services().resolve(user, original.owner, original.repo)
    expect((await findRepositoryIdentity(database, original))?.externalId).toBe(
      '7009',
    )
  })

  it('never publishes cached metadata to either database when their identities differ', async () => {
    const { database, original } = await fixture()
    const client = createClient({ url: 'file::memory:' })
    clients.push(client)
    const cacheDatabase = createLibSqlDatabase(client)
    await migrate(cacheDatabase, { migrationsFolder: './drizzle' })
    const transferred = { ...original, ownerId: 8010 }
    await observeRepositoryIdentity(cacheDatabase, transferred)
    await cacheDatabase.insert(collaboratorTable).values({
      type: 'organization',
      installationId: 1,
      ownerId: 8010,
      repoId: original.id,
      owner: original.owner,
      repo: original.repo,
      email: 'member@example.test',
    })
    await expect(
      Promise.all(
        [database, cacheDatabase].map((store) =>
          observeRepositoryIdentity(store, original, original, {
            readOnlyIfMatches: true,
          }),
        ),
      ),
    ).rejects.toThrow('Repository identity changed')
    expect(
      (await findRepositoryIdentity(cacheDatabase, original))?.ownerId,
    ).toBe('8010')
    expect(await cacheDatabase.select().from(collaboratorTable)).toHaveLength(1)
  })

  it.each(['address-reuse', 'owner-transfer'] as const)(
    'retains the admitted identity when the address mapping changes (%s)',
    async (change) => {
      const { database, original } = await fixture()
      const policy = withRepositoryPolicyIdentity(
        createAccessPolicyGateway({ required: false }),
        database,
        true,
      )
      const request = {
        operation: 'collection.read' as const,
        principal: {
          type: 'collaborator' as const,
          id: 'reader',
          membershipId: '123',
          repositoryIdentity: {
            source: 'github.com',
            externalId: String(original.id),
            ownerId: String(original.ownerId),
          },
        },
        tenant: {
          type: 'repository' as const,
          id: `${original.owner}/${original.repo}`,
        },
        target: {
          repository: { owner: original.owner, repo: original.repo },
          branch: 'main',
        },
      }
      await expect(policy.authorize(request)).resolves.toMatchObject({
        policyVersion: 'default-access-v1',
      })
      await observeRepositoryIdentity(
        database,
        change === 'address-reuse'
          ? { ...original, id: 7009 }
          : { ...original, ownerId: 8010 },
      )
      await expect(policy.authorize(request)).resolves.toMatchObject({
        policyVersion: 'default-access-v1',
      })
    },
  )

  it('rejects hosted repository policy evaluation without admitted owner identity', async () => {
    const { database, original } = await fixture()
    const policy = withRepositoryPolicyIdentity(
      createAccessPolicyGateway({ required: false }),
      database,
      true,
    )
    const request = {
      operation: 'collection.read' as const,
      principal: {
        type: 'collaborator' as const,
        id: 'reader',
        membershipId: '123',
      },
      tenant: {
        type: 'repository' as const,
        id: `${original.owner}/${original.repo}`,
      },
      target: {
        repository: { owner: original.owner, repo: original.repo },
        branch: 'main',
      },
    }
    await expect(policy.authorize(request)).rejects.toThrow(
      'Verified repository identity is required',
    )
    await expect(
      policy.authorize({
        ...request,
        principal: {
          ...request.principal,
          repositoryIdentity: {
            source: 'github.com',
            externalId: String(original.id),
          },
        },
      }),
    ).rejects.toThrow('Verified repository identity is required')
  })

  it('retains the admitted identity when an address changes before collection loading', async () => {
    const { database, original } = await fixture()
    const user = await editor(database, 'collection-reader', 'token')
    const api = fakeApi(original)
    const repositoryAccess = createRepositoryAccessService({
      database,
      cacheDatabase: database,
      githubApp: undefined,
      githubApiFactory: () => api as unknown as GitHubApi,
    })
    const gateway = createAccessPolicyGateway({ required: false })
    const access = withRepositoryPolicyIdentity(
      {
        ...gateway,
        execute: (request, operation) =>
          gateway.execute(request, async (grant) => {
            await observeRepositoryIdentity(database, { ...original, id: 7009 })
            return operation(grant)
          }),
      },
      database,
      true,
    )
    await expect(
      readCollection(
        {
          database,
          cacheDatabase: database,
          repositoryAccess,
          access,
        } as ServiceContext,
        user,
        {
          owner: original.owner,
          repo: original.repo,
          repoId: String(original.id),
          branch: 'main',
          name: 'posts',
        },
      ),
    ).rejects.toThrow('Collection posts was not found')
  })

  it('retains configuration, directory snapshots, activity and action runs across a rename', async () => {
    const { database, original, config } = await fixture()
    const api = {
      source: 'github.com',
      getRefSha: vi.fn(async () => 'head'),
      getDirectory: vi.fn(async () => [
        {
          path: 'posts/a.md',
          name: 'a.md',
          type: 'file' as const,
          sha: 'blob',
          content: 'a',
          size: 1,
          downloadUrl: null,
        },
      ]),
    } as unknown as GitHubApi
    const cache = createDirectoryCache({ database })
    const request = {
      ...original,
      branch: 'main',
      path: 'posts',
      context: 'collection' as const,
      enabled: true,
      api,
    }
    await cache.get(request)
    await recordActivity(database, [
      {
        ...original,
        branch: 'main',
        kind: 'edited',
        area: 'collection',
        resource: 'posts',
        path: 'posts/a.md',
        origin: 'cms',
        commitSha: 'commit',
        occurredAt: new Date(),
      },
    ])
    const [run] = await database
      .insert(actionRunTable)
      .values(
        await repositoryRows(database, {
          ...original,
          ref: 'main',
          workflowRef: 'main',
          sha: 'commit',
          actionName: 'deploy',
          contextType: 'repository',
          workflow: 'deploy.yml',
          status: 'completed',
          triggeredBy: { userId: 'user' },
          payload: { context: { type: 'repository' } },
        }),
      )
      .returning()
    const renamed = {
      ...original,
      owner: 'current-owner',
      repo: 'current-repo',
    }
    await observeRepositoryIdentity(database, renamed, original)
    expect((await findRepositoryIdentity(database, original))?.id).toBe(
      (await findRepositoryIdentity(database, renamed))?.id,
    )
    expect((await config.find(renamed.owner, renamed.repo, 'main'))?.sha).toBe(
      'configuration',
    )
    expect((await cache.get({ ...request, ...renamed })).entries).toHaveLength(
      1,
    )
    expect(api.getDirectory).toHaveBeenCalledOnce()
    expect(api.getRefSha).toHaveBeenCalledOnce()
    expect(
      await readActivity(database, { ...renamed, branch: 'main' }),
    ).toHaveLength(1)
    const statuses = await readActionRunStatuses({
      database,
      cacheDatabase: database,
      ...renamed,
      branch: 'main',
      runIds: [run.id],
      user: {
        name: 'User',
        id: 'user',
        email: 'user@example.com',
        githubUsername: 'user',
      },
      repositoryAccess: {
        resolve: vi.fn(),
      },
    })
    expect(statuses.runs[0]?.id).toBe(run.id)
    await invalidateDirectoryCache(
      database,
      original.owner,
      original.repo,
      'main',
    )
    expect(await database.select().from(cacheFileTable)).toEqual([])
    expect(await database.select().from(cacheFileMetaTable)).toEqual([])
  })

  it('keeps identity while changing permission ownership and revoking old membership on transfer discovery', async () => {
    const { database, original, config } = await fixture()
    await database.insert(collaboratorTable).values({
      type: 'org',
      installationId: 1,
      repoId: original.id,
      ownerId: original.ownerId,
      owner: original.owner,
      repo: original.repo,
      email: 'editor@example.com',
    })
    const identity = async (address: typeof original) =>
      repositoryPolicyIdentityFromRow(
        await findRepositoryIdentity(database, address),
        address,
      )
    const previous = await identity(original)
    const renamed = { ...original, repo: 'renamed' }
    await observeRepositoryIdentity(database, renamed, original)
    expect(await identity(renamed)).toBe(previous)
    const transferred = { ...renamed, owner: 'new-owner', ownerId: 9999 }
    await observeRepositoryIdentity(database, transferred, renamed)
    expect(await identity(transferred)).not.toBe(previous)
    expect(await database.select().from(collaboratorTable)).toHaveLength(0)
    expect(
      await config.find(transferred.owner, transferred.repo, 'main'),
    ).toBeNull()
  })

  it('does not attach old state to a new repository reusing its address', async () => {
    const { database, original, config } = await fixture()
    const moved = { ...original, repo: 'moved' }
    await observeRepositoryIdentity(database, moved, original)
    const replacement = { ...original, id: 7002 }
    await observeRepositoryIdentity(database, replacement)
    expect(
      (await findRepositoryIdentity(database, replacement))?.externalId,
    ).toBe('7002')
    expect((await findRepositoryIdentity(database, moved))?.externalId).toBe(
      '7001',
    )
    expect(
      await config.find(replacement.owner, replacement.repo, 'main'),
    ).toBeNull()
    expect((await config.find(moved.owner, moved.repo, 'main'))?.sha).toBe(
      'configuration',
    )
  })

  it('keeps a delayed configuration refresh in its original repository scope', async () => {
    const { database, original, config } = await fixture()
    let finish!: () => void
    const pending = new Promise<void>((resolve) => {
      finish = resolve
    })
    const getFile = vi.fn(async () => {
      await pending
      return { sha: 'refreshed', content: btoa('content: []') }
    })
    const refresh = config.refresh(
      { source: 'github.com', getFile } as unknown as GitHubApi,
      original.owner,
      original.repo,
      'main',
    )
    await vi.waitFor(() => expect(getFile).toHaveBeenCalledOnce())
    const moved = { ...original, repo: 'moved-during-refresh' }
    await observeRepositoryIdentity(database, moved, original)
    await observeRepositoryIdentity(database, { ...original, id: 7004 })
    finish()
    expect((await refresh)?.sha).toBe('refreshed')
    expect((await config.find(moved.owner, moved.repo, 'main'))?.sha).toBe(
      'refreshed',
    )
    expect(await config.find(original.owner, original.repo, 'main')).toBeNull()
  })

  it('isolates identical provider IDs between forge instances', async () => {
    const { database, original } = await fixture()
    const other = { ...original, source: 'gitlab.example.com' }
    await observeRepositoryIdentity(database, other)
    expect((await findRepositoryIdentity(database, other))?.id).not.toBe(
      (await findRepositoryIdentity(database, original))?.id,
    )
  })

  it('adopts a provisional cache scope from a repository rename webhook', async () => {
    const { database, config } = await fixture()
    await config.save('cold-owner', 'before-name', 'main', 'cold', {
      content: [],
    })
    await handleGitHubWebhook(
      database,
      'repository',
      {
        action: 'renamed',
        repository: {
          id: 7010,
          name: 'after-name',
          owner: { id: 8010, login: 'cold-owner' },
        },
        changes: { repository: { name: { from: 'before-name' } } },
        installation: { id: 1 },
      },
      async () =>
        fakeApi({
          id: 7010,
          ownerId: 8010,
          owner: 'cold-owner',
          repo: 'after-name',
        }) as unknown as GitHubApi,
    )
    expect(
      (
        await findRepositoryIdentity(database, {
          owner: 'cold-owner',
          repo: 'before-name',
        })
      )?.externalId,
    ).toBe('7010')
    expect((await config.find('cold-owner', 'after-name', 'main'))?.sha).toBe(
      'cold',
    )
  })

  it('preserves a provisional configuration when the same repository is observed concurrently', async () => {
    const { database, config } = await fixture()
    const repository = {
      id: 7011,
      ownerId: 8011,
      owner: 'concurrent-owner',
      repo: 'concurrent-repo',
    }
    await config.save(repository.owner, repository.repo, 'main', 'saved-sha', {
      content: [],
    })
    const provisional = await findRepositoryIdentity(database, repository)
    expect(provisional?.externalId).toBeNull()

    await Promise.all([
      observeRepositoryIdentity(database, repository),
      observeRepositoryIdentity(database, repository),
    ])

    const identity = await findRepositoryIdentity(database, repository)
    expect(identity).toMatchObject({ id: provisional!.id, externalId: '7011' })
    expect(
      (await config.find(repository.owner, repository.repo, 'main'))?.sha,
    ).toBe('saved-sha')
  })

  it('does not let late old-owner or transfer webhooks remove new owner memberships', async () => {
    const { database, original } = await fixture()
    const transferred = { ...original, owner: 'new-owner', ownerId: 8010 }
    await observeRepositoryIdentity(database, transferred, original)
    await database.insert(collaboratorTable).values({
      type: 'organization',
      installationId: 1,
      ownerId: transferred.ownerId,
      repoId: original.id,
      owner: transferred.owner,
      repo: transferred.repo,
      email: 'new-owner-member@example.test',
    })
    const resolve = async () => fakeApi(transferred) as unknown as GitHubApi
    await handleGitHubWebhook(
      database,
      'push',
      {
        repository: {
          id: original.id,
          name: original.repo,
          owner: { id: original.ownerId, login: original.owner },
        },
        installation: { id: 1 },
        ref: 'refs/heads/main',
        before: 'a',
        after: 'b',
        commits: [],
      },
      resolve,
    )
    await handleGitHubWebhook(
      database,
      'repository',
      {
        action: 'transferred',
        repository: {
          id: transferred.id,
          name: transferred.repo,
          owner: { id: transferred.ownerId, login: transferred.owner },
        },
        installation: { id: 1 },
        changes: { owner: { from: { login: original.owner } } },
      },
      resolve,
    )
    expect(
      (await findRepositoryIdentityByExternalId(database, String(original.id)))
        ?.ownerId,
    ).toBe(String(transferred.ownerId))
    expect(await database.select().from(collaboratorTable)).toHaveLength(1)
  })

  it('marks the correct cached repository stale when an old push cannot be verified', async () => {
    const { database, original } = await fixture()
    const moved = { ...original, owner: 'new-owner', ownerId: 8010 }
    const row = await observeRepositoryIdentity(database, moved, original)
    await database.insert(cacheFileMetaTable).values({
      repositoryId: row.id,
      owner: moved.owner,
      repo: moved.repo,
      branch: 'main',
      path: '',
      context: 'branch',
      status: 'ok',
    })
    await handleGitHubWebhook(
      database,
      'push',
      {
        repository: {
          id: original.id,
          name: original.repo,
          owner: { id: original.ownerId, login: original.owner },
        },
        installation: { id: 1 },
        ref: 'refs/heads/main',
        before: 'a',
        after: 'b',
        commits: [],
      },
      async () => fakeApi(moved) as unknown as GitHubApi,
    )
    expect((await database.select().from(cacheFileMetaTable))[0].status).toBe(
      'stale',
    )
  })

  it('revokes a deleted repository membership without a provider lookup', async () => {
    const { database } = await fixture()
    await database.insert(collaboratorTable).values({
      type: 'organization',
      installationId: 1,
      ownerId: 9500,
      repoId: 9400,
      owner: 'deleted-owner',
      repo: 'deleted-repo',
      email: 'member@example.test',
    })
    const resolve = vi.fn(async () => {
      throw new Error('provider unavailable')
    })
    await handleGitHubWebhook(
      database,
      'repository',
      {
        action: 'deleted',
        repository: {
          id: 9400,
          name: 'deleted-repo',
          owner: { id: 9500, login: 'deleted-owner' },
        },
        installation: { id: 1 },
      },
      resolve,
    )
    expect(await database.select().from(collaboratorTable)).toHaveLength(0)
    expect(resolve).not.toHaveBeenCalled()
  })

  it('leaves a replacement repository membership intact on a delayed deletion', async () => {
    const { database, original } = await fixture()
    const replacement = { ...original, id: original.id + 1 }
    await observeRepositoryIdentity(database, replacement)
    for (const [id, email] of [
      [original.id, 'old@example.test'],
      [replacement.id, 'new@example.test'],
    ] as const) {
      await database.insert(collaboratorTable).values({
        type: 'organization',
        installationId: 1,
        ownerId: original.ownerId,
        repoId: id,
        owner: original.owner,
        repo: original.repo,
        email,
      })
    }
    await handleGitHubWebhook(database, 'repository', {
      action: 'deleted',
      repository: {
        id: original.id,
        name: original.repo,
        owner: { id: original.ownerId, login: original.owner },
      },
    })
    expect(await database.select().from(collaboratorTable)).toEqual([
      expect.objectContaining({
        repoId: replacement.id,
        email: 'new@example.test',
      }),
    ])
  })

  it('ignores an account rename when the new login no longer exists', async () => {
    const { database, original } = await fixture()
    await observeRepositoryIdentity(database, original)
    await expect(
      handleGitHubWebhook(
        database,
        'installation_target',
        {
          action: 'renamed',
          account: { id: original.ownerId, login: 'missing-owner' },
          changes: { login: { from: original.owner } },
          installation: { id: 1 },
        },
        async () =>
          ({
            getRepository: async () => {
              throw new GitHubApiError('Not Found', 404)
            },
          }) as unknown as GitHubApi,
      ),
    ).resolves.toBeUndefined()
    expect((await findRepositoryIdentity(database, original))?.externalId).toBe(
      String(original.id),
    )
  })

  it('checks cache-only identities before an account rename across separate databases', async () => {
    const { database } = await fixture()
    const { database: cacheDatabase } = await fixture()
    const cached = {
      id: 90901,
      ownerId: 90902,
      owner: 'split-owner',
      repo: 'project',
    }
    await observeRepositoryIdentity(cacheDatabase, cached)
    const getRepository = vi.fn(async () => {
      throw new GitHubApiError('Not Found', 404)
    })
    await handleGitHubWebhook(
      database,
      'installation_target',
      {
        action: 'renamed',
        account: { id: cached.ownerId, login: 'stale-rename' },
        changes: { login: { from: cached.owner } },
        installation: { id: 1 },
      },
      async () => ({ getRepository }) as unknown as GitHubApi,
      cacheDatabase,
    )
    expect(getRepository).toHaveBeenCalledOnce()
    expect(
      (await findRepositoryIdentity(cacheDatabase, cached))?.externalId,
    ).toBe(String(cached.id))
    expect(
      await findRepositoryIdentity(cacheDatabase, {
        owner: 'stale-rename',
        repo: cached.repo,
      }),
    ).toBeNull()
  })

  it('tries another repository when the first account-rename probe is missing', async () => {
    const { database, original } = await fixture()
    const second = { ...original, id: 7012, repo: 'other-repo' }
    await observeRepositoryIdentity(database, second)
    const getRepository = vi.fn(async (_owner: string, repo: string) => {
      if (repo === original.repo) throw new GitHubApiError('Not Found', 404)
      return { ...second, owner: 'new-account' }
    })
    await handleGitHubWebhook(
      database,
      'installation_target',
      {
        action: 'renamed',
        account: { id: original.ownerId, login: 'new-account' },
        changes: { login: { from: original.owner } },
        installation: { id: 1 },
      },
      async () => ({ getRepository }) as unknown as GitHubApi,
    )
    expect(getRepository).toHaveBeenCalledTimes(2)
    expect(
      (
        await findRepositoryIdentity(database, {
          owner: 'new-account',
          repo: second.repo,
        })
      )?.externalId,
    ).toBe(String(second.id))
  })

  it('verifies an account rename directly even when all cached repositories are inaccessible', async () => {
    const { database, original } = await fixture()
    for (let i = 0; i < 4; i++)
      await observeRepositoryIdentity(database, {
        ...original,
        id: 8100 + i,
        repo: `stale-${i}`,
      })
    await database.insert(collaboratorTable).values({
      type: 'organization',
      installationId: 1,
      ownerId: original.ownerId,
      repoId: original.id,
      owner: original.owner,
      repo: original.repo,
      email: 'rename@example.test',
    })
    const resolveApi = vi.fn(async () => {
      throw new Error('repository probe should not run')
    })
    const account = vi.fn(async () => ({
      id: original.ownerId,
      login: 'new-account',
    }))
    await handleGitHubWebhook(
      database,
      'installation_target',
      {
        action: 'renamed',
        account: { id: original.ownerId, login: 'new-account' },
        changes: { login: { from: original.owner } },
        installation: { id: 1 },
      },
      resolveApi,
      database,
      account,
    )
    expect(resolveApi).not.toHaveBeenCalled()
    expect(account).toHaveBeenCalledOnce()
    expect((await database.select().from(collaboratorTable))[0].owner).toBe(
      'new-account',
    )
    expect(
      (
        await findRepositoryIdentity(database, {
          owner: 'new-account',
          repo: 'stale-3',
        })
      )?.externalId,
    ).toBe('8103')
  })

  it('ignores an old rename when the installation account has since changed', async () => {
    const { database, original } = await fixture()
    await observeRepositoryIdentity(database, original)
    await handleGitHubWebhook(
      database,
      'installation_target',
      {
        action: 'renamed',
        account: { id: original.ownerId, login: 'old-rename' },
        changes: { login: { from: original.owner } },
        installation: { id: 1 },
      },
      undefined,
      database,
      async () => ({ id: original.ownerId, login: 'current-name' }),
    )
    expect((await findRepositoryIdentity(database, original))?.externalId).toBe(
      String(original.id),
    )
    expect(
      await findRepositoryIdentity(database, {
        owner: 'old-rename',
        repo: original.repo,
      }),
    ).toBeNull()
  })

  it('repairs collaborator coordinates even without a cached repository', async () => {
    const { database, original } = await fixture()
    await database.insert(collaboratorTable).values({
      type: 'organization',
      installationId: 1,
      ownerId: original.ownerId,
      repoId: 9811,
      owner: 'unseen-owner',
      repo: 'unseen-repo',
      email: 'cold@example.test',
    })
    await handleGitHubWebhook(
      database,
      'installation_target',
      {
        action: 'renamed',
        account: { id: original.ownerId, login: 'new-account' },
        changes: { login: { from: 'unseen-owner' } },
        installation: { id: 1 },
      },
      undefined,
      database,
      async () => ({ id: original.ownerId, login: 'new-account' }),
    )
    expect((await database.select().from(collaboratorTable))[0].owner).toBe(
      'new-account',
    )
  })

  it('does not apply an account rename if installation verification fails', async () => {
    const { database, original } = await fixture()
    await observeRepositoryIdentity(database, original)
    const delivery = {
      action: 'renamed',
      account: { id: original.ownerId, login: 'new-account' },
      changes: { login: { from: original.owner } },
      installation: { id: 1 },
    }
    await handleGitHubWebhook(
      database,
      'installation_target',
      delivery,
      undefined,
      database,
      async () => ({ id: original.ownerId + 1, login: 'new-account' }),
    )
    await expect(
      handleGitHubWebhook(
        database,
        'installation_target',
        delivery,
        undefined,
        database,
        async () => {
          throw new Error('GitHub unavailable')
        },
      ),
    ).rejects.toThrow('GitHub unavailable')
    expect((await findRepositoryIdentity(database, original))?.externalId).toBe(
      String(original.id),
    )
    expect(
      await findRepositoryIdentity(database, {
        owner: 'new-account',
        repo: original.repo,
      }),
    ).toBeNull()
  })

  it('updates verified rename coordinates in separate stores without replacing another repository', async () => {
    const { database, original } = await fixture()
    const { database: cacheDatabase } = await fixture()
    const conflict = {
      ...original,
      id: original.id + 500,
      owner: 'new-account',
    }
    await observeRepositoryIdentity(cacheDatabase, original)
    await observeRepositoryIdentity(cacheDatabase, conflict)
    const separate = { ...original, id: original.id + 501, repo: 'other' }
    await observeRepositoryIdentity(cacheDatabase, separate)
    await handleGitHubWebhook(
      database,
      'installation_target',
      {
        action: 'renamed',
        account: { id: original.ownerId, login: 'new-account' },
        changes: { login: { from: original.owner } },
        installation: { id: 1 },
      },
      undefined,
      cacheDatabase,
      async () => ({ id: original.ownerId, login: 'new-account' }),
    )
    expect(
      (await findRepositoryIdentity(cacheDatabase, conflict))?.externalId,
    ).toBe(String(conflict.id))
    expect(
      (await findRepositoryIdentity(cacheDatabase, original))?.externalId,
    ).toBe(String(original.id))
    expect(
      (
        await findRepositoryIdentity(cacheDatabase, {
          owner: 'new-account',
          repo: 'other',
        })
      )?.externalId,
    ).toBe(String(separate.id))
  })

  it('does not replace an existing repository address during an account rename', async () => {
    const { database, original } = await fixture()
    const stale = { ...original, id: 7013, repo: 'clash' }
    const current = { ...stale, id: 7014, owner: 'new-account' }
    await observeRepositoryIdentity(database, stale)
    await observeRepositoryIdentity(database, current)
    await handleGitHubWebhook(
      database,
      'installation_target',
      {
        action: 'renamed',
        account: { id: original.ownerId, login: 'new-account' },
        changes: { login: { from: original.owner } },
        installation: { id: 1 },
      },
      async () =>
        fakeApi({ ...original, owner: 'new-account' }) as unknown as GitHubApi,
    )
    expect((await findRepositoryIdentity(database, current))?.externalId).toBe(
      String(current.id),
    )
  })

  it('does not call GitHub for a cold webhook with no local repository scope', async () => {
    const { database } = await fixture()
    const resolve = vi.fn()
    await handleGitHubWebhook(
      database,
      'push',
      {
        repository: {
          id: 9499,
          name: 'new-repo',
          owner: { id: 9599, login: 'new-owner' },
        },
        installation: { id: 1 },
        ref: 'refs/heads/main',
        before: 'a',
        after: 'b',
        commits: [],
      },
      resolve,
    )
    expect(resolve).not.toHaveBeenCalled()
  })

  it('does not rename a replacement repository when an old rename is redelivered', async () => {
    const { database, original } = await fixture()
    const renamed = { ...original, repo: 'renamed' }
    await observeRepositoryIdentity(database, renamed, original)
    const replacement = { ...original, id: 7011 }
    await observeRepositoryIdentity(database, replacement)
    await database.insert(collaboratorInviteTable).values({
      repoId: replacement.id,
      token: 'replacement-invite',
      email: 'replacement@example.test',
      owner: replacement.owner,
      repo: replacement.repo,
      expiresAt: new Date(Date.now() + 60000),
    })
    await handleGitHubWebhook(
      database,
      'repository',
      {
        action: 'renamed',
        repository: {
          id: renamed.id,
          name: renamed.repo,
          owner: { id: renamed.ownerId, login: renamed.owner },
        },
        changes: { repository: { name: { from: original.repo } } },
        installation: { id: 1 },
      },
      async () => fakeApi(renamed) as unknown as GitHubApi,
    )
    expect((await findRepositoryIdentity(database, original))?.externalId).toBe(
      String(replacement.id),
    )
    expect((await findRepositoryIdentity(database, renamed))?.externalId).toBe(
      String(renamed.id),
    )
    expect(
      (await database.select().from(collaboratorInviteTable))[0].repo,
    ).toBe(original.repo)
  })

  it('invalidates unverified cold scopes after an account rename without a metadata request', async () => {
    const { database, config } = await fixture()
    await config.save('cold-account', 'unverified', 'main', 'cold', {
      content: [],
    })
    const resolve = vi.fn()
    await handleGitHubWebhook(
      database,
      'installation_target',
      {
        action: 'renamed',
        account: { id: 8011, login: 'renamed-account' },
        changes: { login: { from: 'cold-account' } },
      },
      resolve,
    )
    expect(
      await findRepositoryIdentity(database, {
        owner: 'cold-account',
        repo: 'unverified',
      }),
    ).toBeNull()
    expect(await config.find('cold-account', 'unverified', 'main')).toBeNull()
    expect(resolve).not.toHaveBeenCalled()
  })

  it('detaches cold scopes without deleting history or renaming a different owner', async () => {
    const { database, config, original } = await fixture()
    const cold = { owner: original.owner, repo: 'cold' }
    await config.save(cold.owner, cold.repo, 'main', 'cold', { content: [] })
    await recordActivity(database, [
      {
        ...cold,
        branch: 'main',
        kind: 'edited',
        area: 'collection',
        resource: 'posts',
        path: 'posts/a.md',
        origin: 'cms',
        commitSha: 'cold-history',
        occurredAt: new Date(),
      },
    ])
    await handleGitHubWebhook(database, 'installation_target', {
      action: 'renamed',
      account: { id: 9999, login: 'different-owner' },
      changes: { login: { from: original.owner } },
    })
    expect(await findRepositoryIdentity(database, cold)).toBeNull()
    expect(await config.find(cold.owner, cold.repo, 'main')).toBeNull()
    expect(await database.select().from(activityTable)).toEqual([
      expect.objectContaining({ commitSha: 'cold-history' }),
    ])
    expect(await findRepositoryIdentity(database, original)).toMatchObject({
      ownerId: String(original.ownerId),
      owner: original.owner,
    })
    expect(
      await findRepositoryIdentity(database, {
        ...original,
        owner: 'different-owner',
      }),
    ).toBeNull()
    const replacement = await observeRepositoryIdentity(database, {
      ...cold,
      id: 7788,
      ownerId: 9999,
    })
    const [history] = await database.select().from(activityTable)
    expect(history.repositoryId).not.toBe(replacement.id)
  })

  it('renames account identities in both application and separate cache databases', async () => {
    const app = await fixture()
    const cache = await fixture()
    await handleGitHubWebhook(
      app.database,
      'installation_target',
      {
        action: 'renamed',
        account: { id: app.original.ownerId, login: 'new-owner-name' },
        changes: { login: { from: app.original.owner } },
        installation: { id: 1 },
      },
      async () =>
        fakeApi({
          ...app.original,
          owner: 'new-owner-name',
        }) as unknown as GitHubApi,
      cache.database,
    )
    for (const database of [app.database, cache.database]) {
      const row = await findRepositoryIdentity(database, {
        owner: 'new-owner-name',
        repo: app.original.repo,
      })
      expect(row?.externalId).toBe(String(app.original.id))
      expect(row?.ownerId).toBe(String(app.original.ownerId))
      expect(row?.owner).toBe('new-owner-name')
    }
  })

  it('ignores an account rename redelivered after the login changed back', async () => {
    const { database, original } = await fixture()
    await database.insert(collaboratorTable).values({
      type: 'organization',
      installationId: 1,
      ownerId: original.ownerId,
      repoId: original.id,
      owner: original.owner,
      repo: original.repo,
      email: 'member@example.test',
    })
    await handleGitHubWebhook(
      database,
      'installation_target',
      {
        action: 'renamed',
        account: { id: original.ownerId, login: 'old-temporary-name' },
        changes: { login: { from: original.owner } },
        installation: { id: 1 },
      },
      async () => fakeApi(original) as unknown as GitHubApi,
    )
    expect((await findRepositoryIdentity(database, original))?.owner).toBe(
      original.owner,
    )
    expect((await database.select().from(collaboratorTable))[0].owner).toBe(
      original.owner,
    )
  })

  it('rejects a stale editor identity when authorization discovers address reuse', async () => {
    const { database, original } = await fixture()
    const user = {
      id: 'identity-user',
      name: 'Editor',
      email: 'identity@example.com',
      githubUsername: 'editor',
    }
    await database.insert(userTable).values(user)
    await database.insert(accountTable).values({
      id: 'identity-account',
      accountId: 'editor',

      providerId: 'github',
      userId: user.id,
      accessToken: 'local-test',
    })
    const base = {
      source: 'github.com',
      getRepository: vi.fn(async () => ({
        ...original,
        id: 7009,
        defaultBranch: 'main',
        private: true,
        canPush: true,
      })),
      putFile: vi.fn(),
    } as unknown as GitHubApi
    const service = createRepositoryAccessService({
      database,
      cacheDatabase: database,
      githubApp: undefined,
      githubApiFactory: () => base,
    })
    await expect(
      service.resolve(
        user,
        original.owner,
        original.repo,
        'main',
        String(original.id),
      ),
    ).rejects.toThrow('repository at this address changed')
    expect(base.getRepository).toHaveBeenCalledOnce()
    await expect(
      service.executeMutation(
        user,
        { ...original, repoId: String(original.id), branch: 'main' },
        'single',
        async () => {},
      ),
    ).rejects.toThrow('repository at this address changed')
    expect(base.putFile).not.toHaveBeenCalled()
  })

  it('skips credentials/head requests for empty caches and ignored webhook events', async () => {
    const { database, original } = await fixture()
    const resolve = vi.fn(async () => {
      throw new Error('unexpected GitHub request')
    })
    const payload = {
      repository: {
        id: original.id,
        name: original.repo,
        owner: { id: original.ownerId, login: original.owner },
      },
      installation: { id: 1 },
      ref: 'refs/heads/uncached',
      before: 'before',
      after: 'after',
      commits: [{ added: [], removed: [], modified: ['posts/a.md'] }],
    }
    await handleGitHubWebhook(database, 'push', payload, resolve)
    await handleGitHubWebhook(database, 'check_run', payload, resolve)
    expect(resolve).not.toHaveBeenCalled()
  })
  it('rolls back address, ownership and membership changes if identity publication fails', async () => {
    const { database, original } = await fixture()
    await database.insert(collaboratorTable).values({
      type: 'org',
      installationId: 1,
      repoId: original.id,
      ownerId: original.ownerId,
      owner: original.owner,
      repo: original.repo,
      email: 'atomic@example.com',
    })
    await database.run(
      sql`create trigger reject_identity before update on repository_address begin select raise(abort, 'identity failed'); end`,
    )
    await expect(
      observeRepositoryIdentity(
        database,
        { ...original, ownerId: 999, owner: 'different' },
        original,
      ),
    ).rejects.toThrow()
    expect((await findRepositoryIdentity(database, original))?.ownerId).toBe(
      String(original.ownerId),
    )
    expect((await findRepositoryIdentity(database, original))?.owner).toBe(
      original.owner,
    )
    expect(await database.select().from(collaboratorTable)).toHaveLength(1)
  })

  it('does not create repository identities for rejected mutations', async () => {
    const { database } = await fixture()
    const user = await editor(database, 'rejected-editor', 'rejected-token')
    const tokenless = await editor(database, 'tokenless-editor')
    const api = fakeApi()
    const service = createRepositoryAccessService({
      database,
      cacheDatabase: database,
      githubApp: undefined,
      githubApiFactory: () => api as unknown as GitHubApi,
    })
    const address = { owner: 'arbitrary-owner', repo: 'arbitrary-repo' }
    const repository = { ...address, branch: 'main' }
    const before = await identityRows(database)
    const save = (
      principal: typeof user,
      kind: 'single' | 'multi',
      authorize = async () => {},
    ) =>
      service.executeMutation(principal, repository, kind, async () => {
        await resolveRepositoryPrincipal(service, principal, repository)
        await authorize()
        const { api: resolvedApi } = await service.resolve(
          principal,
          address.owner,
          address.repo,
        )
        return resolvedApi.putFile({
          ...repository,
          path: 'a.md',
          content: 'a',
          message: 'Save',
        })
      })
    await expect(
      save(user, 'single', async () => {
        throw new Error('policy denied')
      }),
    ).rejects.toThrow('permission')
    for (const status of [401, 404]) {
      api.putFile.mockRejectedValueOnce(new GitHubApiError('Denied', status))
      await expect(save(user, 'single')).rejects.toThrow('permission')
    }
    await expect(save(user, 'multi')).rejects.toThrow('permission')
    await expect(save(tokenless, 'single')).rejects.toThrow('permission')
    expect(await findRepositoryIdentity(database, address)).toBeNull()
    expect(await identityRows(database)).toEqual(before)
    expect(api.putFile).not.toHaveBeenCalled()
  })

  it('does not record a public repository when GitHub grants read-only access', async () => {
    const { database } = await fixture()
    const user = await editor(database, 'read-only-user', 'read-only-token')
    const address = { owner: 'public-owner', repo: 'public-repo' }
    const api = fakeApi({ ...address, id: 7400 })
    const metadata = await api.getRepository(address.owner, address.repo)
    api.getRepository.mockResolvedValue({ ...metadata, canPush: false })
    const service = createRepositoryAccessService({
      database,
      cacheDatabase: database,
      githubApp: undefined,
      githubApiFactory: () => api as unknown as GitHubApi,
    })
    await expect(
      service.resolve(user, address.owner, address.repo),
    ).rejects.toThrow('permission')
    const mutate = vi.fn(async () => undefined)
    await expect(
      service.executeMutation(
        user,
        { ...address, branch: 'main' },
        'multi',
        mutate,
      ),
    ).rejects.toThrow('permission')
    expect(mutate).not.toHaveBeenCalled()
    expect(await findRepositoryIdentity(database, address)).toBeNull()
  })

  it('does not authorize a pinned mutation using permissions from a replacement repository', async () => {
    const { database, original } = await fixture()
    const user = await editor(
      database,
      'replacement-writer',
      'replacement-token',
    )
    const api = fakeApi({ ...original, id: 7401 })
    const service = createRepositoryAccessService({
      database,
      cacheDatabase: database,
      githubApp: undefined,
      githubApiFactory: () => api as unknown as GitHubApi,
    })
    const mutate = vi.fn(async () => undefined)
    await expect(
      service.executeMutation(
        user,
        { ...original, repoId: String(original.id), branch: 'main' },
        'single',
        mutate,
      ),
    ).rejects.toThrow('address changed')
    expect(mutate).not.toHaveBeenCalled()
    expect((await findRepositoryIdentity(database, original))?.externalId).toBe(
      String(original.id),
    )
  })

  it.each([true, false])(
    'verifies a cold ID-pinned mutation (matching ID: %s)',
    async (matching) => {
      const { database } = await fixture()
      const user = await editor(database, 'cold-pinned', 'cold-pinned-token')
      const repository = {
        id: 7201,
        ownerId: 8201,
        owner: 'new-owner',
        repo: 'new-repo',
      }
      const api = fakeApi(repository)
      const service = createRepositoryAccessService({
        database,
        cacheDatabase: database,
        githubApp: undefined,
        githubApiFactory: () => api as unknown as GitHubApi,
      })
      const input = {
        ...repository,
        branch: 'main',
        repoId: matching ? '7201' : '9999',
      }
      const operation = vi.fn(async () => 'saved')
      const result = service.executeMutation(user, input, 'single', operation)
      if (matching) {
        await expect(result).resolves.toBe('saved')
        expect(operation).toHaveBeenCalledOnce()
      } else {
        await expect(result).rejects.toThrow('address changed')
        expect(operation).not.toHaveBeenCalled()
        expect(await findRepositoryIdentity(database, repository)).toBeNull()
      }
      expect(api.getRepository).toHaveBeenCalledOnce()
    },
  )

  it('verifies cold repository metadata and claims identities found midway', async () => {
    const { database } = await fixture()
    const user = await editor(database, 'cold-editor', 'cold-token')
    const api = fakeApi({ id: 7200, owner: 'cold-owner', repo: 'renamed' })
    const service = createRepositoryAccessService({
      database,
      cacheDatabase: database,
      githubApp: undefined,
      githubApiFactory: () => api as unknown as GitHubApi,
    })
    const cold = { owner: 'cold-owner', repo: 'cold-repo', branch: 'main' }
    const alias = { ...cold, repo: 'renamed' }
    const file = { path: 'a.md', content: 'a', message: 'Save' }
    await service.executeMutation(user, cold, 'single', async () => {
      const { api: resolvedApi } = await service.resolve(
        user,
        cold.owner,
        cold.repo,
      )
      return resolvedApi.putFile({ ...cold, ...file })
    })
    expect(api.getRepository).toHaveBeenCalledOnce()
    expect(api.putFile.mock.calls[0]?.[0]).toMatchObject(cold)
    expect((await findRepositoryIdentity(database, cold))?.externalId).toBe(
      '7200',
    )

    await service.executeMutation(user, cold, 'single', async () => {
      const first = await service.resolve(user, cold.owner, cold.repo)
      await expect(
        service.executeMutation(user, cold, 'single', async () => {}),
      ).rejects.toThrow('already running')
      await first.api.getRepository(cold.owner, cold.repo)
      await expect(
        service.executeMutation(user, alias, 'single', async () => {}),
      ).rejects.toThrow('already running')
      expect(await service.resolve(user, cold.owner, cold.repo)).toBe(first)
      expect(await service.resolve(user, alias.owner, alias.repo)).toBe(first)
      return first.api.putFile({ ...cold, ...file })
    })
    expect(api.putFile.mock.calls[1]?.[0]).toMatchObject(cold)
    await service.executeMutation(user, alias, 'single', async () => {})
    expect(api.getRepository).toHaveBeenCalledTimes(4)
  })

  it('keeps a known mutation pinned when its address is reused midway', async () => {
    const { database, original } = await fixture()
    const user = await editor(database, 'pinned-editor', 'pinned-token')
    const api = fakeApi(original)
    const service = createRepositoryAccessService({
      database,
      cacheDatabase: database,
      githubApp: undefined,
      githubApiFactory: () => api as unknown as GitHubApi,
    })
    const repository = { ...original, branch: 'main' }
    const moved = { ...original, repo: 'moved-midway' }
    await service.executeMutation(
      user,
      { ...repository, repoId: String(original.id) },
      'single',
      async () => {
        const first = await service.resolve(user, original.owner, original.repo)
        await observeRepositoryIdentity(database, moved, original)
        await observeRepositoryIdentity(database, { ...original, id: 7005 })
        await expect(
          service.resolve(user, original.owner, original.repo, 'main', '7005'),
        ).rejects.toThrow('address changed')
        expect(await service.resolve(user, original.owner, original.repo)).toBe(
          first,
        )
        return first.api.putFile({
          ...repository,
          path: 'a.md',
          content: 'a',
          message: 'Save',
        })
      },
    )
    expect(api.putFile.mock.calls[0]?.[0]).toMatchObject({
      owner: original.owner,
      repo: original.repo,
    })
    expect(api.getRepository).toHaveBeenCalledOnce()
  })

  it('pins a mutation to the verified identity when a provisional address is merged', async () => {
    const { database, original } = await fixture()
    const user = await editor(database, 'provisional-editor', 'user-token')
    const alias = { owner: original.owner, repo: 'provisional-alias' }
    const provisional = await ensureRepositoryIdentity(database, alias)
    expect(provisional.externalId).toBeNull()
    const api = fakeApi(original)
    const service = createRepositoryAccessService({
      database,
      cacheDatabase: database,
      githubApp: undefined,
      githubApiFactory: () => api as unknown as GitHubApi,
    })
    await service.executeMutation(
      user,
      { ...alias, branch: 'main' },
      'single',
      async () => {
        const admission = await service.resolve(user, alias.owner, alias.repo)
        return admission.api.putFile({
          ...alias,
          branch: 'main',
          path: 'a.md',
          content: 'YQ==',
          message: 'Save',
        })
      },
    )
    expect(api.putFile.mock.calls[0]?.[0]).toMatchObject(alias)
  })

  it('rechecks collaborator membership even when the installation token is cached', async () => {
    const { database, original } = await fixture()
    const user = await editor(database, 'revoked-token-cache')
    await database.insert(collaboratorTable).values({
      type: 'org',
      installationId: 77,
      repoId: original.id,
      ownerId: original.ownerId,
      owner: original.owner,
      repo: original.repo,
      email: user.email,
    })
    const cryptoKey = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)))
    await database.insert(githubInstallationTokenTable).values({
      ...(await encryptSecret('installation', cryptoKey)),
      installationId: 77,
      expiresAt: new Date(Date.now() + 600_000),
    })
    const api = fakeApi(original)
    const service = () =>
      createRepositoryAccessService({
        database,
        cacheDatabase: database,
        githubApp: { appId: '1', privateKey: 'cached-token-only', cryptoKey },
        githubApiFactory: () => api as unknown as GitHubApi,
      })
    await expect(
      service().resolve(user, original.owner, original.repo),
    ).resolves.toMatchObject({ tokenSource: 'installation' })
    await database
      .delete(collaboratorTable)
      .where(eq(collaboratorTable.installationId, 77))
    await expect(
      service().resolve(user, original.owner, original.repo),
    ).rejects.toThrow('permission')
    expect(api.getRepository).toHaveBeenCalledOnce()
  })

  it('rejects a collaborator when an address is reused before the identity map updates', async () => {
    const { database, original } = await fixture()
    const user = await editor(database, 'stale-collaborator')
    await database.insert(collaboratorTable).values({
      type: 'org',
      installationId: 77,
      repoId: original.id,
      ownerId: original.ownerId,
      owner: original.owner,
      repo: original.repo,
      email: user.email,
    })
    const cryptoKey = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)))
    await database.insert(githubInstallationTokenTable).values({
      ...(await encryptSecret('installation', cryptoKey)),
      installationId: 77,
      expiresAt: new Date(Date.now() + 600000),
    })
    const replacement = fakeApi({ ...original, id: original.id + 1 })
    const service = createRepositoryAccessService({
      database,
      cacheDatabase: database,
      githubApp: { appId: '1', privateKey: 'cached-token-only', cryptoKey },
      githubApiFactory: () => replacement as unknown as GitHubApi,
    })
    await expect(
      service.resolve(user, original.owner, original.repo),
    ).rejects.toThrow('address changed')
    expect(replacement.getRepository).toHaveBeenCalledOnce()
    expect(replacement.putFile).not.toHaveBeenCalled()
    expect((await findRepositoryIdentity(database, original))?.externalId).toBe(
      String(original.id),
    )
  })

  it('does not import another user’s grant into the identity registry', async () => {
    const { database } = await fixture()
    const user = await editor(database, 'uninvited')
    const address = { owner: 'unimported-owner', repo: 'unimported-repo' }
    await database.insert(collaboratorTable).values({
      type: 'org',
      installationId: 77,
      repoId: 7300,
      ownerId: 8300,
      ...address,
      email: 'someone-else@example.com',
    })
    const service = createRepositoryAccessService({
      database,
      cacheDatabase: database,
      githubApp: undefined,
    })
    await expect(
      service.resolve(user, address.owner, address.repo),
    ).rejects.toThrow('do not have permission')
    expect(await findRepositoryIdentity(database, address)).toBeNull()
  })

  it('rejects the wrong ID before importing or binding a cold collaborator', async () => {
    const { database } = await fixture()
    const user = await editor(database, 'cold-collaborator')
    const repository = {
      id: 7391,
      ownerId: 8391,
      owner: 'cold-member-owner',
      repo: 'project',
    }
    await database.insert(collaboratorTable).values({
      type: 'org',
      installationId: 77,
      repoId: repository.id,
      ownerId: repository.ownerId,
      owner: repository.owner,
      repo: repository.repo,
      email: user.email,
    })
    const cryptoKey = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)))
    await database.insert(githubInstallationTokenTable).values({
      ...(await encryptSecret('installation', cryptoKey)),
      installationId: 77,
      expiresAt: new Date(Date.now() + 600000),
    })
    const api = fakeApi(repository)
    const service = createRepositoryAccessService({
      database,
      cacheDatabase: database,
      githubApp: { appId: '1', privateKey: 'cached-token-only', cryptoKey },
      githubApiFactory: () => api as unknown as GitHubApi,
    })
    const operation = vi.fn()
    await expect(
      service.executeMutation(
        user,
        {
          ...repository,
          branch: 'main',
          repoId: 'wrong-id',
        },
        'single',
        operation,
      ),
    ).rejects.toThrow('address changed')
    expect(operation).not.toHaveBeenCalled()
    expect(await findRepositoryIdentity(database, repository)).toBeNull()
    expect(
      (await database.select().from(collaboratorTable))[0].userId,
    ).toBeNull()
  })

  it('verifies cold collaborator grants before importing an identity', async () => {
    const { database } = await fixture()
    const staleUser = await editor(database, 'stale-import')
    const validUser = await editor(database, 'valid-import')
    const address = { owner: 'cold-owner', repo: 'cold-repo' }
    const current = { ...address, id: 7301, ownerId: 8301 }
    for (const [member, repoId, ownerId] of [
      [staleUser, 7300, 8300],
      [validUser, 7301, 8301],
    ] as const)
      await database.insert(collaboratorTable).values({
        type: 'org',
        installationId: 77,
        repoId,
        ownerId,
        ...address,
        email: member.email,
      })
    const cryptoKey = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)))
    await database.insert(githubInstallationTokenTable).values({
      ...(await encryptSecret('installation', cryptoKey)),
      installationId: 77,
      expiresAt: new Date(Date.now() + 600000),
    })
    const api = fakeApi(current)
    const access = () =>
      createRepositoryAccessService({
        database,
        cacheDatabase: database,
        githubApp: { appId: '1', privateKey: 'cached-token-only', cryptoKey },
        githubApiFactory: () => api as unknown as GitHubApi,
      })
    await expect(
      access().resolve(staleUser, address.owner, address.repo),
    ).rejects.toThrow('do not have permission')
    expect(await findRepositoryIdentity(database, address)).toBeNull()
    expect(await database.select().from(collaboratorTable)).toHaveLength(2)
    await expect(
      access().resolve(validUser, address.owner, address.repo),
    ).resolves.toMatchObject({ tokenSource: 'installation' })
    expect((await findRepositoryIdentity(database, address))?.externalId).toBe(
      '7301',
    )
  })

  it('checks a renamed collaborator repository at its canonical address', async () => {
    const { database, original } = await fixture()
    const user = await editor(database, 'renamed-collaborator')
    await database.insert(collaboratorTable).values({
      type: 'org',
      installationId: 77,
      repoId: original.id,
      ownerId: original.ownerId,
      owner: original.owner,
      repo: original.repo,
      email: user.email,
    })
    const moved = { ...original, repo: 'renamed-repo' }
    await observeRepositoryIdentity(database, moved, original)
    const cryptoKey = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)))
    await database.insert(githubInstallationTokenTable).values({
      ...(await encryptSecret('installation', cryptoKey)),
      installationId: 77,
      expiresAt: new Date(Date.now() + 600000),
    })
    const api = fakeApi(moved)
    const service = createRepositoryAccessService({
      database,
      cacheDatabase: database,
      githubApp: { appId: '1', privateKey: 'cached-token-only', cryptoKey },
      githubApiFactory: () => api as unknown as GitHubApi,
    })
    await expect(
      service.resolve(user, original.owner, original.repo),
    ).resolves.toMatchObject({ tokenSource: 'installation' })
    expect(api.getRepository).toHaveBeenCalledWith(moved.owner, moved.repo, {
      fresh: false,
    })
  })

  it('fails a mutation when the admitted credential fails without trying another credential', async () => {
    const { database } = await fixture()
    const user = await editor(database, 'fallback-editor', 'fallback-user')
    const cryptoKey = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)))
    await database.insert(githubInstallationTokenTable).values({
      ...(await encryptSecret('fallback-installation', cryptoKey)),
      installationId: 77,
      expiresAt: new Date(Date.now() + 600000),
    })
    const cold = { owner: 'fallback-owner', repo: 'fallback-repo' }
    await database.insert(collaboratorTable).values({
      type: 'org',
      installationId: 77,
      repoId: 7300,
      ownerId: 8300,
      ...cold,
      email: user.email,
    })
    const direct = fakeApi({ ...cold, id: 7300, ownerId: 8300 })
    const installation = fakeApi({ ...cold, id: 7300, ownerId: 8300 })
    direct.putFile.mockRejectedValue(new GitHubApiError('Bad credentials', 401))
    const service = createRepositoryAccessService({
      database,
      cacheDatabase: database,
      githubApp: { appId: '1', privateKey: 'cached-token-only', cryptoKey },
      githubApiFactory: (token) =>
        (token === 'fallback-installation'
          ? installation
          : direct) as unknown as GitHubApi,
    })
    const repository = { ...cold, branch: 'main' }
    const principals: string[] = []
    const save = () =>
      service.executeMutation(user, repository, 'single', async () => {
        principals.push(
          (await resolveRepositoryPrincipal(service, user, repository)).type,
        )
        const { api } = await service.resolve(user, cold.owner, cold.repo)
        return api.putFile({
          ...repository,
          path: 'content/a.md',
          content: 'a',
          message: 'Save',
        })
      })
    await expect(save()).rejects.toThrow('Bad credentials')
    expect(principals).toEqual(['user'])
    expect(direct.putFile).toHaveBeenCalledOnce()
    expect(installation.putFile).not.toHaveBeenCalled()
    expect((await findRepositoryIdentity(database, cold))?.externalId).toBe(
      '7300',
    )
  })
})

it('keeps activity rename cleanup on the captured identity when an address changes during hashing', async () => {
  const { database, original } = await fixture()
  const replacement = {
    id: 7002,
    ownerId: 8001,
    owner: original.owner,
    repo: 'replacement',
  }
  await observeRepositoryIdentity(database, replacement)
  const event = {
    branch: 'main',
    kind: 'edited' as const,
    area: 'collection' as const,
    resource: 'posts',
    path: 'posts/before.md',
    origin: 'cms' as const,
    commitSha: 'same-commit',
    occurredAt: new Date(),
  }
  await recordActivity(database, [{ ...replacement, ...event }])
  const originalId = (await findRepositoryIdentity(database, original))!.id
  const digest = crypto.subtle.digest.bind(crypto.subtle)
  const spy = vi
    .spyOn(crypto.subtle, 'digest')
    .mockImplementationOnce(async (algorithm, bytes) => {
      await observeRepositoryIdentity(
        database,
        { ...original, repo: 'renamed' },
        original,
      )
      await observeRepositoryIdentity(
        database,
        { ...replacement, repo: original.repo },
        replacement,
      )
      return digest(algorithm, bytes)
    })
  try {
    await recordActivity(database, [
      {
        ...original,
        ...event,
        kind: 'renamed',
        path: 'posts/after.md',
        previousPath: event.path,
      },
    ])
  } finally {
    spy.mockRestore()
  }
  const records = await database.select().from(activityTable)
  expect(records).toHaveLength(2)
  expect(records.find((row) => row.repositoryId === originalId)).toMatchObject({
    path: 'posts/after.md',
  })
  expect(records.find((row) => row.repositoryId !== originalId)).toMatchObject({
    path: 'posts/before.md',
  })
})

it('searches current repository addresses by exact owner/name or scoped literal name', async () => {
  const { database } = await fixture()
  for (const [id, owner, repo] of [
    [9, 'team', 'docs'],
    [10, 'team', 'docs_private'],
    [11, 'other', 'docs-private'],
  ] as const) {
    await observeRepositoryIdentity(database, { id, ownerId: 123, owner, repo })
  }
  expect(
    (
      await searchRepositoryIdentities(database, 'TEAM/DOCS', {
        owners: ['Team'],
      })
    ).map((r) => r.externalId),
  ).toEqual(['9'])
  expect(
    (
      await searchRepositoryIdentities(database, 'docs', { owners: ['team'] })
    ).map((r) => r.externalId),
  ).toEqual(['9', '10'])
  expect(
    (
      await searchRepositoryIdentities(database, '_', {
        repositoryIds: ['9', '10', '11'],
      })
    ).map((r) => r.externalId),
  ).toEqual(['10'])
  expect(
    await searchRepositoryIdentities(database, 'team/docs', {
      repositoryIds: ['11'],
    }),
  ).toEqual([])
})
