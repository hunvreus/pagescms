import { repositoryRows } from '../repository-fixture'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { createDatabase } from '#/server/db/client'
import { actionRunTable } from '#/server/db/schema'
import {
  readActionRunName,
  readActionRunStatuses,
} from '#/server/actions/actions'
import { observeRepositoryIdentity } from '#/server/access/repository-identity'
import type { RepositoryAccessService } from '#/server/access/repository'

const enabled = Boolean(process.env.TEST_DATABASE_URL)
describe.skipIf(!enabled)('action status reads and recovery checks', () => {
  const database = enabled
    ? createDatabase({ url: process.env.TEST_DATABASE_URL! })
    : undefined!
  const ref = { owner: 'action-status-fixture', repo: 'test', branch: 'main' }
  const getWorkflowRun = vi.fn()
  const listWorkflowRuns = vi.fn()
  const resolve = vi
    .fn()
    .mockResolvedValue({ api: { getWorkflowRun, listWorkflowRuns } })
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
      .values(
        await repositoryRows(database, {
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
        }),
      )
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
  it('matches a pending dispatch to an unclaimed workflow run', async () => {
    await seed(new Date())
    const [pending] = await database
      .insert(actionRunTable)
      .values(
        await repositoryRows(database, {
          owner: ref.owner,
          repo: ref.repo,
          ref: ref.branch,
          sha: 'pending',
          contextType: 'repository',
          actionName: 'deploy',
          workflow: 'deploy.yml',
          workflowRef: 'main',
          status: 'queued',
          triggeredBy: { userId: 'owner' },
          payload: {},
        }),
      )
      .returning()
    const now = new Date().toISOString()
    listWorkflowRuns.mockResolvedValue([
      {
        id: 123,
        createdAt: now,
        updatedAt: now,
        status: 'in_progress',
        conclusion: null,
        htmlUrl: 'claimed',
      },
      {
        id: 456,
        createdAt: now,
        updatedAt: now,
        status: 'in_progress',
        conclusion: null,
        htmlUrl: 'new',
      },
    ])
    const result = await readActionRunStatuses({
      ...input,
      runIds: [pending.id],
    })
    expect(result.runs[0]).toMatchObject({ id: pending.id, workflowRunId: 456 })
  })
  it('never returns runs from another branch even when their IDs are supplied', async () => {
    const id = await seed(new Date(), 'private')
    expect(
      (await readActionRunStatuses({ ...input, runIds: [id] })).runs,
    ).toEqual([])
    expect(resolve).not.toHaveBeenCalled()
  })
  it('reads a run name only for the requested repository and branch', async () => {
    await observeRepositoryIdentity(database, {
      id: 42,
      owner: ref.owner,
      repo: ref.repo,
    })
    const id = await seed(new Date())
    await expect(
      readActionRunName(database, { ...ref, runId: id, repoId: '42' }),
    ).resolves.toBe('deploy')
    await expect(
      readActionRunName(database, { ...ref, runId: id, repoId: '43' }),
    ).rejects.toThrow('Action run not found')
    await expect(
      readActionRunName(database, {
        ...ref,
        runId: id,
        branch: 'other',
        repoId: '42',
      }),
    ).rejects.toThrow('Action run not found')
  })
})
