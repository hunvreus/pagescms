import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { createDatabase } from '#/server/database/client.server'
import { actionRunTable } from '#/server/database/schema'
import { readActionRunStatuses } from '#/server/action-service.server'
import type { RepositoryAccessService } from '#/server/repository-access.server'

const enabled = Boolean(process.env.TEST_DATABASE_URL)
describe.skipIf(!enabled)('action status reads and recovery checks', () => {
  const database = enabled
    ? createDatabase({ url: process.env.TEST_DATABASE_URL! })
    : undefined!
  const ref = { owner: 'action-status-fixture', repo: 'test', branch: 'main' }
  const getWorkflowRun = vi.fn()
  const resolve = vi.fn().mockResolvedValue({ api: { getWorkflowRun } })
  const input = {
    ...ref,
    database,
    cacheDatabase: database,
    repositoryAccess: { resolve } as RepositoryAccessService,
    user: {
      id: 'owner',
      name: 'Owner',
      email: 'owner@example.com',
      githubUsername: 'owner',
    },
  }
  beforeEach(async () => {
    await database
      .delete(actionRunTable)
      .where(eq(actionRunTable.owner, ref.owner))
    vi.clearAllMocks()
  })
  afterAll(async () => {
    await database
      .delete(actionRunTable)
      .where(eq(actionRunTable.owner, ref.owner))
  })
  async function seed(checkedAt: Date | null, branch = 'main') {
    const [run] = await database
      .insert(actionRunTable)
      .values({
        owner: ref.owner,
        repo: ref.repo,
        ref: branch,
        sha: 'status-fixture',
        contextType: 'repository',
        actionName: 'deploy',
        workflow: 'deploy.yml',
        workflowRef: 'main',
        workflowRunId: 123,
        status: 'in_progress',
        checkedAt,
        triggeredBy: { userId: 'owner' },
        payload: {},
      })
      .returning()
    return run.id
  }
  it('reads recent statuses from the database without checking GitHub or configuration', async () => {
    const id = await seed(new Date())
    const result = await readActionRunStatuses({ ...input, runIds: [id] })
    expect(result.runs).toMatchObject([{ id, status: 'in_progress' }])
    expect(resolve).not.toHaveBeenCalled()
    expect(getWorkflowRun).not.toHaveBeenCalled()
  })
  it('shares a database lease across concurrent recovery requests and stops checking completed runs', async () => {
    const id = await seed(null)
    getWorkflowRun.mockResolvedValue({
      status: 'completed',
      conclusion: 'success',
      htmlUrl: 'https://github.com/run/123',
      updatedAt: new Date().toISOString(),
    })
    await Promise.all([
      readActionRunStatuses({ ...input, runIds: [id] }),
      readActionRunStatuses({ ...input, runIds: [id] }),
    ])
    expect(getWorkflowRun).toHaveBeenCalledOnce()
    const result = await readActionRunStatuses({ ...input, runIds: [id] })
    expect(result.runs[0]).toMatchObject({
      id,
      status: 'completed',
      conclusion: 'success',
    })
    expect(getWorkflowRun).toHaveBeenCalledOnce()
  })
  it('also throttles failed GitHub checks', async () => {
    const id = await seed(null)
    getWorkflowRun.mockRejectedValue(new Error('GitHub unavailable'))
    await readActionRunStatuses({ ...input, runIds: [id] })
    await readActionRunStatuses({ ...input, runIds: [id] })
    expect(getWorkflowRun).toHaveBeenCalledOnce()
  })
  it('never returns runs from another branch even when their IDs are supplied', async () => {
    const id = await seed(new Date(), 'private')
    expect(
      (await readActionRunStatuses({ ...input, runIds: [id] })).runs,
    ).toEqual([])
    expect(resolve).not.toHaveBeenCalled()
  })
})
