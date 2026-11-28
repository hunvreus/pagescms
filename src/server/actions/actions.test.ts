import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  dispatchRepositoryAction,
  loadRepositoryActions,
  manageRepositoryAction,
} from './actions'
import type { Database } from '#/server/db/client'
import { createClient } from '@libsql/client'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { createLibSqlDatabase } from '#/server/db/client'
import { actionRunTable } from '#/server/db/schema'
import { ensureRepositoryIdentity } from '#/server/access/repository-identity'
import { eq } from 'drizzle-orm'

const configuration = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('#/server/cache/configuration', () => ({
  createConfigurationStore: () => configuration,
}))

describe('repository action discovery', () => {
  beforeEach(() => {
    configuration.get.mockResolvedValue({
      object: {
        actions: [{ name: 'deploy', label: 'Deploy', workflow: 'deploy.yml' }],
      },
    })
  })

  it('authorizes and lists configured actions without reading or synchronizing runs', async () => {
    const select = vi.fn()
    const resolve = vi.fn().mockResolvedValue({ api: {} })
    const result = await loadRepositoryActions({
      database: { select } as unknown as Database,
      cacheDatabase: {} as Database,
      repositoryAccess: { resolve },
      user: {
        id: 'owner',
        name: 'Owner',
        email: 'owner@example.com',
        githubUsername: 'owner',
      },
      owner: 'pagescms',
      repo: 'test',
      branch: 'main',
      includeRuns: false,
    })
    expect(result.actions).toMatchObject([
      { name: 'deploy', workflow: 'deploy.yml' },
    ])
    expect(result.runs).toEqual([])
    expect(resolve).toHaveBeenCalledOnce()
    expect(select).not.toHaveBeenCalled()
  })

  it('does not bypass repository access when runs are omitted', async () => {
    await expect(
      loadRepositoryActions({
        database: {} as Database,
        cacheDatabase: {} as Database,
        repositoryAccess: {
          resolve: vi.fn().mockRejectedValue(new Error('Access denied')),
        },
        user: {
          id: 'owner',
          name: 'Owner',
          email: 'owner@example.com',
          githubUsername: 'owner',
        },
        owner: 'pagescms',
        repo: 'test',
        branch: 'main',
        includeRuns: false,
      }),
    ).rejects.toThrow('Access denied')
  })

  it('records failed and successful workflow dispatches', async () => {
    const client = createClient({ url: 'file::memory:' })
    try {
      const database = createLibSqlDatabase(client)
      await migrate(database, { migrationsFolder: './drizzle' })
      const identity = await ensureRepositoryIdentity(database, {
        owner: 'pagescms',
        repo: 'test',
      })
      const api = {
        getRefSha: async () => 'sha',
        dispatchWorkflow: vi
          .fn()
          .mockRejectedValueOnce(new Error('GitHub unavailable'))
          .mockResolvedValue(undefined),
        cancelWorkflowRun: vi.fn(async () => undefined),
      }
      const input = {
        database,
        cacheDatabase: database,
        repositoryAccess: {
          resolve: async () => ({
            api,
            tokenSource: 'user' as const,
            identity: { applicationId: identity.id },
          }),
        } as never,
        user: {
          id: 'owner',
          name: 'Owner',
          email: 'owner@example.com',
          githubUsername: 'owner',
        },
        owner: 'pagescms',
        repo: 'test',
        branch: 'main',
        allowCollaboratorExecution: true,
        actionName: 'deploy',
        inputs: {},
        context: {
          type: 'repository' as const,
          name: null,
          path: null,
          data: {},
        },
      }
      await expect(dispatchRepositoryAction(input)).rejects.toThrow(
        'GitHub unavailable',
      )
      expect(await database.select().from(actionRunTable)).toMatchObject([
        {
          repositoryId: identity.id,
          status: 'completed',
          conclusion: 'failure',
          failure: { message: 'GitHub unavailable' },
        },
      ])
      const queued = await dispatchRepositoryAction(input)
      expect(queued).toMatchObject({ status: 'queued' })
      await database
        .update(actionRunTable)
        .set({ workflowRunId: 123 })
        .where(eq(actionRunTable.id, queued.id))
      await expect(
        manageRepositoryAction({
          ...input,
          runId: queued.id,
          intent: 'cancel',
        }),
      ).resolves.toMatchObject({
        status: 'completed',
        conclusion: 'cancelled',
      })
      expect(api.cancelWorkflowRun).toHaveBeenCalledOnce()
    } finally {
      client.close()
    }
  })
})
