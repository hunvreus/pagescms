import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createDatabase } from '#/server/database/client.server'
import {
  repositoryTable,
  collaboratorTable,
  configTable,
  cacheFileMetaTable,
  cacheFileTable,
} from '#/server/database/schema'
import {
  loadAdminDashboard,
  resetGlobalCache,
} from '#/server/admin-service.server'
import { createProjectService } from '#/server/projects.server'

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
    const service = createProjectService(database, database, {
      resolve: vi.fn().mockResolvedValue({
        api: {
          getRepository: vi
            .fn()
            .mockResolvedValue({ owner: 'Owner', repo: 'Repo' }),
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
      owner: 'owner',
      repo: 'repo',
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
  it('clears only the selected cache scope', async () => {
    await database!
      .insert(cacheFileMetaTable)
      .values({ owner: 'owner', repo: 'repo', branch: 'main' })
    await database!.insert(configTable).values({
      owner: 'owner',
      repo: 'repo',
      branch: 'main',
      sha: 'sha',
      version: '3.0',
      object: '{}',
    })
    await resetGlobalCache(database!, 'content')
    expect(await database!.select().from(cacheFileMetaTable)).toHaveLength(0)
    expect(await database!.select().from(configTable)).toHaveLength(1)
    await resetGlobalCache(database!, 'configuration')
    expect(await database!.select().from(configTable)).toHaveLength(0)
  })
})
