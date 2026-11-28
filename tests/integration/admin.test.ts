import { repositoryRows } from '../repository-fixture'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createDatabase } from '#/server/db/client'
import {
  repositoryTable,
  collaboratorTable,
  configTable,
  cacheFileMetaTable,
  cacheFileTable,
} from '#/server/db/schema'
import { loadAdminDashboard, resetGlobalCache } from '#/server/admin/admin'
import { createRepositoryService } from '#/server/__tests__/credentials'

const url = process.env.TEST_DATABASE_URL
const integration = url ? describe : describe.skip
const database = url ? createDatabase({ url }) : null

integration('global administration', () => {
  beforeEach(async () => {
    for (const table of [
      repositoryTable,
      collaboratorTable,
      configTable,
      cacheFileMetaTable,
      cacheFileTable,
    ])
      await database!.delete(table)
  })
  it('records successful opens once and preserves inventory across cache clearing', async () => {
    if (!database) throw new Error('Integration database is required')
    const service = createRepositoryService(database, database, {
      resolve: vi.fn().mockResolvedValue({
        api: {
          getRepository: vi.fn().mockResolvedValue({
            id: 10,
            ownerId: 20,
            owner: 'Owner',
            repo: 'Repo',
            defaultBranch: 'main',
          }),
          listBranches: vi.fn().mockResolvedValue(['main']),
        },
      }),
    })
    const user = {
      id: 'admin-test',
      email: 'admin@example.com',
      githubUsername: 'owner',
    }
    await service.openRepository(user, 'Owner', 'Repo')
    await service.openRepository(user, 'owner', 'repo')
    await resetGlobalCache(database)
    expect(await database.select().from(repositoryTable)).toHaveLength(1)
    const dashboard = await loadAdminDashboard(database, database, {
      query: '',
      page: 1,
      repoQuery: 'OWNER/REPO',
    })
    expect(dashboard.repositories[0]).toMatchObject({
      owner: 'Owner',
      repo: 'Repo',
      source: 'github.com',
      collaborators: 0,
    })
  })
  it('paginates repository inventory independently of user search', async () => {
    await database!.insert(repositoryTable).values(
      Array.from({ length: 21 }, (_, index) => ({
        source: 'github.com',
        owner: 'owner',
        repo: `repo-${index}`,
        lastOpenedAt: new Date(index * 1000),
      })),
    )
    const dashboard = await loadAdminDashboard(database!, database!, {
      query: 'missing-user',
      page: 1,
      repoPage: 2,
    })
    expect(dashboard.repoPages).toBe(2)
    expect(dashboard.repositories).toHaveLength(1)
    expect(dashboard.matchingRepositories).toBe(21)
    expect(dashboard.matchingUsers).toBe(0)
  })
  it('counts active collaborators without counting retained removals', async () => {
    await database!.insert(repositoryTable).values({
      source: 'github.com',
      externalId: '10',
      ownerId: '2',
      owner: 'owner',
      repo: 'repo',
      lastOpenedAt: new Date(),
    })
    const member = {
      repoId: 10,
      type: 'user',
      installationId: 1,
      ownerId: 2,
      owner: 'Owner',
      repo: 'Repo',
      email: 'editor@example.com',
    }
    await database!
      .insert(collaboratorTable)
      .values([member, { ...member, repoId: 11, repo: 'another-repository' }])
    const dashboard = await loadAdminDashboard(database!, database!, {
      query: '',
      page: 1,
    })
    expect(dashboard.repositories[0].collaborators).toBe(1)
  })
  it('clears only the selected cache scope', async () => {
    await database!.insert(cacheFileMetaTable).values(
      await repositoryRows(database!, {
        owner: 'owner',
        repo: 'repo',
        branch: 'main',
      }),
    )
    await database!.insert(configTable).values(
      await repositoryRows(database!, {
        owner: 'owner',
        repo: 'repo',
        branch: 'main',
        sha: 'sha',
        version: '3.0',
        object: '{}',
      }),
    )
    await resetGlobalCache(database!, 'content')
    expect(await database!.select().from(cacheFileMetaTable)).toHaveLength(0)
    expect(await database!.select().from(configTable)).toHaveLength(1)
    await resetGlobalCache(database!, 'configuration')
    expect(await database!.select().from(configTable)).toHaveLength(0)
  })
})
