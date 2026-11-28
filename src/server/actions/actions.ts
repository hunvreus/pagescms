import { configurationStoreFor } from '#/server/cache/configuration-access'
import { UserError } from '#/server/http'

import {
  repositoryActions,
  resolveActionRef,
  schemaActions,
  validateActionInputs,
} from '#/lib/actions'
import {
  findContentSchema,
  findMediaSchema,
} from '#/shared/configuration-content'
import { normalizeGitPath } from '#/shared/git-path'

import { admittedConfigurationScope } from '#/server/cache/configuration'
import { all, first, repositoryAddressQuery } from '#/server/db/sql'
import { executeAtomic } from '#/server/db/core'
import { DEFAULT_REPOSITORY_SOURCE } from '../repository/provider'
import { requireRepositoryManager } from '#/server/access/repository-policy'

import type { Database } from '#/server/db/client'
import type { RepositoryUser } from '../repository/repositories'
import type { RepositoryAccessService } from '#/server/access/repository'

import type { actionRunTable } from '#/server/db/schema'

type ActionInput = {
  database: Database
  cacheDatabase: Database
  repositoryAccess: RepositoryAccessService
  user: RepositoryUser & { name: string; image?: string | null }
  owner: string
  repo: string
  branch: string
  repoId?: string
  allowCollaboratorExecution?: boolean
}

type ActionRun = typeof actionRunTable.$inferSelect
type NewActionRun = Pick<
  ActionRun,
  | 'repositoryId'
  | 'owner'
  | 'repo'
  | 'ref'
  | 'workflowRef'
  | 'sha'
  | 'actionName'
  | 'contextType'
  | 'contextName'
  | 'contextPath'
  | 'workflow'
  | 'triggeredBy'
  | 'payload'
  | 'createdAt'
  | 'updatedAt'
>
type StoredActionRun = Omit<
  ActionRun,
  | 'triggeredBy'
  | 'payload'
  | 'failure'
  | 'createdAt'
  | 'updatedAt'
  | 'checkedAt'
  | 'completedAt'
> & {
  triggeredBy: string
  payload: string
  failure: string | null
  createdAt: number
  updatedAt: number
  checkedAt: number | null
  completedAt: number | null
}

const actionColumns = `id, repository_id AS repositoryId, owner, repo, ref,
  workflow_ref AS workflowRef, sha, action_name AS actionName,
  context_type AS contextType, context_name AS contextName, context_path AS contextPath,
  workflow, workflow_run_id AS workflowRunId, status, conclusion, html_url AS htmlUrl,
  triggered_by AS triggeredBy, failure, payload, created_at AS createdAt,
  updated_at AS updatedAt, checked_at AS checkedAt, completed_at AS completedAt`

function actionRun(row: StoredActionRun): ActionRun {
  return {
    ...row,
    triggeredBy: JSON.parse(row.triggeredBy),
    payload: JSON.parse(row.payload),
    failure: row.failure === null ? null : JSON.parse(row.failure),
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
    checkedAt: row.checkedAt === null ? null : new Date(row.checkedAt),
    completedAt: row.completedAt === null ? null : new Date(row.completedAt),
  }
}

function actionRepository(
  input: Pick<ActionInput, 'owner' | 'repo' | 'repoId'>,
) {
  return input.repoId === undefined
    ? repositoryAddressQuery(DEFAULT_REPOSITORY_SOURCE, input.owner, input.repo)
    : {
        sql: '(SELECT id FROM repository WHERE source = ? AND external_id = ?)',
        args: [DEFAULT_REPOSITORY_SOURCE, input.repoId],
      }
}

async function insertActionRun(database: Database, run: NewActionRun) {
  const [result] = await executeAtomic(database, [
    {
      sql: `INSERT INTO action_run (repository_id, owner, repo, ref, workflow_ref, sha, action_name,
      context_type, context_name, context_path, workflow, status, triggered_by, payload, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'dispatching', ?, ?, ?, ?) RETURNING ${actionColumns}`,
      args: [
        run.repositoryId,
        run.owner,
        run.repo,
        run.ref,
        run.workflowRef,
        run.sha,
        run.actionName,
        run.contextType,
        run.contextName,
        run.contextPath,
        run.workflow,
        JSON.stringify(run.triggeredBy),
        JSON.stringify(run.payload),
        run.createdAt.getTime(),
        run.updatedAt.getTime(),
      ],
    },
  ])
  if (!result.rows[0]) throw new Error('Could not record action run')
  return actionRun(result.rows[0] as StoredActionRun)
}

async function failActionRun(database: Database, id: number, error: unknown) {
  const now = Date.now()
  await executeAtomic(database, [
    {
      sql: `UPDATE action_run SET status = 'completed', conclusion = 'failure',
      failure = ?, updated_at = ?, completed_at = ? WHERE id = ?`,
      args: [
        JSON.stringify({
          message: error instanceof Error ? error.message : 'Dispatch failed',
        }),
        now,
        now,
        id,
      ],
    },
  ])
}

async function queueActionRun(database: Database, run: ActionRun) {
  const [result] = await executeAtomic(database, [
    {
      sql: `UPDATE action_run SET status = 'queued', updated_at = ? WHERE id = ? RETURNING ${actionColumns}`,
      args: [Date.now(), run.id],
    },
  ])
  return result.rows[0] ? actionRun(result.rows[0] as StoredActionRun) : run
}

export type RepositoryActionContext = {
  type: 'repository' | 'collection' | 'entry' | 'file' | 'media'
  name: string | null
  path: string | null
  data: Record<string, unknown>
}

function configuredActions(
  configuration: Record<string, unknown>,
  context: RepositoryActionContext,
) {
  if (context.type === 'repository') return repositoryActions(configuration)
  if (!context.name) throw new UserError('Action context name is required')
  const schema =
    context.type === 'media'
      ? findMediaSchema(configuration, context.name)
      : findContentSchema(configuration, context.name)
  if (!schema)
    throw new UserError(`Action context ${context.name} was not found`)
  if (context.type === 'collection' && schema.type !== 'collection') {
    throw new UserError('Collection action context is invalid')
  }
  if (context.type === 'entry' && schema.type !== 'collection') {
    throw new UserError('Entry action context is invalid')
  }
  if (context.type === 'file' && schema.type !== 'file') {
    throw new UserError('File action context is invalid')
  }
  const rootValue = context.type === 'media' ? schema.input : schema.path
  if (typeof rootValue !== 'string') {
    throw new UserError('Action context root is invalid')
  }
  const root = normalizeGitPath(rootValue)
  const path = normalizeGitPath(context.path ?? root)
  if (path !== root && !path.startsWith(`${root}/`)) {
    throw new UserError('Action context path is outside its configured root')
  }
  return context.type === 'collection'
    ? schemaActions(schema, 'collection')
    : context.type === 'entry'
      ? schemaActions(schema, 'entry')
      : schemaActions(schema)
}

async function actionContext(
  input: ActionInput,
  context: RepositoryActionContext = {
    type: 'repository',
    name: null,
    path: null,
    data: {},
  },
) {
  const admission = await input.repositoryAccess.resolve(
    input.user,
    input.owner,
    input.repo,
    input.branch,
    input.repoId,
  )
  const { api, repository, identity: admittedIdentity } = admission
  const configuration = await configurationStoreFor(
    input.repositoryAccess,
    input.cacheDatabase,
  ).get(
    api,
    input.owner,
    input.repo,
    input.branch,
    repository ? String(repository.id) : undefined,
    repository && admittedConfigurationScope(admittedIdentity),
  )
  if (!configuration) throw new UserError('Repository configuration not found')
  return {
    api,
    identity: admission.identity,
    actions: configuredActions(configuration.object, context),
  }
}

function summary(
  row: typeof actionRunTable.$inferSelect,
  user: ActionInput['user'],
  allowCollaboratorExecution = false,
) {
  const triggeredBy = row.triggeredBy as {
    userId?: string
    name?: string
    email?: string
  }
  return {
    id: row.id,
    actionName: row.actionName,
    status: row.status,
    conclusion: row.conclusion,
    htmlUrl: row.htmlUrl,
    workflowRunId: row.workflowRunId,
    workflowRef: row.workflowRef,
    sha: row.sha,
    contextType: row.contextType,
    contextName: row.contextName,
    contextPath: row.contextPath,
    triggeredBy: {
      id: triggeredBy.userId ?? null,
      name: triggeredBy.name ?? triggeredBy.email ?? 'Unknown user',
      email: triggeredBy.email ?? null,
    },
    canCancel:
      row.status !== 'completed' &&
      row.workflowRunId !== null &&
      (user.githubUsername !== null || triggeredBy.userId === user.id) &&
      ((row.payload as { action?: { cancelable?: boolean } }).action
        ?.cancelable ??
        true),
    canRerun: user.githubUsername !== null || allowCollaboratorExecution,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  }
}

async function syncActionRun(
  input: ActionInput,
  api: Awaited<ReturnType<RepositoryAccessService['resolve']>>['api'],
  row: typeof actionRunTable.$inferSelect,
) {
  if (row.status === 'completed') return row
  const interval = row.workflowRunId === null ? 30_000 : 120_000
  const now = new Date()
  if (row.checkedAt && now.getTime() - row.checkedAt.getTime() < interval)
    return row
  // A database lease prevents different requests/Workers from repeating the same GitHub check.
  const [lease] = await executeAtomic(input.database, [
    {
      sql: `UPDATE action_run SET checked_at = ? WHERE id = ? AND status <> 'completed'
      AND (checked_at IS NULL OR checked_at < ?) RETURNING id`,
      args: [now.getTime(), row.id, now.getTime() - interval],
    },
  ])
  if (!lease.rows.length) return row
  try {
    if (row.workflowRunId === null) {
      const claimedRows = await all<{ workflowRunId: number }>(
        input.database,
        `SELECT workflow_run_id AS workflowRunId FROM action_run
        WHERE repository_id = ? AND workflow = ? AND workflow_ref = ?
          AND workflow_run_id IS NOT NULL AND id != ?`,
        [row.repositoryId, row.workflow, row.workflowRef, row.id],
      )
      const claimed = new Set(claimedRows.map((value) => value.workflowRunId))
      const startedAt = row.createdAt.getTime() - 30_000
      const workflowRun = (
        await api.listWorkflowRuns({
          owner: input.owner,
          repo: input.repo,
          workflow: row.workflow,
          ref: row.workflowRef,
        })
      )
        .filter(
          (value) =>
            Date.parse(value.createdAt) >= startedAt && !claimed.has(value.id),
        )
        .sort(
          (left, right) =>
            Date.parse(right.createdAt) - Date.parse(left.createdAt),
        )
        .at(0)
      if (!workflowRun) return row
      const [updated] = await executeAtomic(input.database, [
        {
          sql: `UPDATE action_run SET workflow_run_id = ?, status = ?, conclusion = ?, html_url = ?,
          updated_at = ?, completed_at = ? WHERE id = ? AND checked_at = ?
          AND status <> 'completed' RETURNING ${actionColumns}`,
          args: [
            workflowRun.id,
            workflowRun.status,
            workflowRun.conclusion,
            workflowRun.htmlUrl,
            Date.now(),
            workflowRun.status === 'completed'
              ? new Date(workflowRun.updatedAt).getTime()
              : null,
            row.id,
            now.getTime(),
          ],
        },
      ])
      return updated.rows[0]
        ? actionRun(updated.rows[0] as StoredActionRun)
        : row
    }

    const workflowRun = await api.getWorkflowRun(
      row.owner,
      row.repo,
      row.workflowRunId,
    )
    const [updated] = await executeAtomic(input.database, [
      {
        sql: `UPDATE action_run SET status = ?, conclusion = ?, html_url = ?,
        updated_at = ?, completed_at = ? WHERE id = ? AND checked_at = ?
        AND status <> 'completed' RETURNING ${actionColumns}`,
        args: [
          workflowRun.status,
          workflowRun.conclusion,
          workflowRun.htmlUrl,
          Date.now(),
          workflowRun.status === 'completed'
            ? new Date(workflowRun.updatedAt).getTime()
            : null,
          row.id,
          now.getTime(),
        ],
      },
    ])
    return updated.rows[0] ? actionRun(updated.rows[0] as StoredActionRun) : row
  } catch {
    return row
  }
}

export async function readActionRunStatuses(
  input: ActionInput & { runIds: number[] },
) {
  const repository = actionRepository(input)
  const rows = (
    await all<StoredActionRun>(
      input.database,
      `SELECT ${actionColumns} FROM action_run WHERE repository_id = ${repository.sql}
      AND ref = ? AND id IN (SELECT value FROM json_each(?))`,
      [...repository.args, input.branch, JSON.stringify(input.runIds)],
    )
  ).map(actionRun)
  const now = Date.now()
  const due = rows.filter(
    (row) =>
      row.status !== 'completed' &&
      (!row.checkedAt ||
        now - row.checkedAt.getTime() >=
          (row.workflowRunId === null ? 30_000 : 120_000)),
  )
  const updates = new Map<number, (typeof rows)[number]>()
  if (due.length) {
    const { api } = await input.repositoryAccess.resolve(
      input.user,
      input.owner,
      input.repo,
      input.branch,
      input.repoId,
    )
    // Sequential discovery also avoids competing pending runs claiming the same workflow.
    for (const row of due.slice(0, 20))
      updates.set(row.id, await syncActionRun(input, api, row))
  }
  return {
    actions: [],
    runs: rows.map((row) =>
      summary(
        updates.get(row.id) ?? row,
        input.user,
        input.allowCollaboratorExecution,
      ),
    ),
  }
}

export async function loadRepositoryActions(
  input: ActionInput & { includeRuns?: boolean },
) {
  const { actions, api } = await actionContext(input)
  if (input.includeRuns === false) return { actions, runs: [] }
  const repository = actionRepository(input)
  const rows = (
    await all<StoredActionRun>(
      input.database,
      `SELECT ${actionColumns} FROM action_run WHERE repository_id = ${repository.sql}
      AND ref = ? ORDER BY created_at DESC LIMIT 100`,
      [...repository.args, input.branch],
    )
  ).map(actionRun)
  const synchronized = new Map<number, (typeof rows)[number]>()
  const identifiedActiveRows = rows
    .filter((row) => row.status !== 'completed' && row.workflowRunId !== null)
    .slice(0, 20)
  const identifiedUpdates = await Promise.all(
    identifiedActiveRows.map((row) => syncActionRun(input, api, row)),
  )
  for (const row of identifiedUpdates) synchronized.set(row.id, row)

  const unidentifiedActiveRows = rows
    .filter((row) => row.status !== 'completed' && row.workflowRunId === null)
    .slice(0, 10)
  // Keep discovery sequential so concurrent local runs cannot claim the same
  // GitHub workflow run. Known run IDs are safe to refresh in parallel above.
  for (const row of unidentifiedActiveRows) {
    const updated = await syncActionRun(input, api, row)
    synchronized.set(updated.id, updated)
  }
  return {
    actions,
    runs: rows.map((row) =>
      summary(
        synchronized.get(row.id) ?? row,
        input.user,
        input.allowCollaboratorExecution,
      ),
    ),
  }
}

export async function dispatchRepositoryAction(
  input: ActionInput & {
    actionName: string
    inputs: Record<string, unknown>
    context: RepositoryActionContext
  },
) {
  if (!input.allowCollaboratorExecution)
    await requireRepositoryManager(input.repositoryAccess, input.user, input)
  const { api, actions, identity } = await actionContext(input, input.context)
  if (!identity) throw new Error('Verified repository identity is required')
  const action = actions.find((value) => value.name === input.actionName)
  if (!action) throw new UserError(`Action ${input.actionName} was not found`)
  const values = validateActionInputs(action.fields ?? [], input.inputs)
  const workflowRef = resolveActionRef(action.ref, input.branch)
  const sha = await api.getRefSha(input.owner, input.repo, workflowRef)
  const timestamp = new Date()
  const triggeredBy = {
    userId: input.user.id,
    name: input.user.name,
    email: input.user.email,
    githubUsername: input.user.githubUsername,
    image: input.user.image ?? null,
  }
  const payload = {
    source: 'pages-cms',
    action: {
      name: action.name,
      label: action.label,
      cancelable: action.cancelable !== false,
    },
    repository: {
      owner: input.owner,
      repo: input.repo,
      ref: input.branch,
      workflowRef,
      sha,
    },
    triggeredAt: timestamp.toISOString(),
    triggeredBy,
    context: input.context,
    inputs: values,
  }
  const run = await insertActionRun(input.database, {
    repositoryId: identity.applicationId,
    owner: input.owner,
    repo: input.repo,
    ref: input.branch,
    workflowRef,
    sha,
    actionName: action.name,
    contextType: input.context.type,
    contextName: input.context.name,
    contextPath: input.context.path,
    workflow: action.workflow,
    triggeredBy,
    payload,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  try {
    await api.dispatchWorkflow({
      owner: input.owner,
      repo: input.repo,
      workflow: action.workflow,
      ref: workflowRef,
      inputs: { payload: JSON.stringify(payload) },
    })
    return summary(await queueActionRun(input.database, run), input.user)
  } catch (error) {
    await failActionRun(input.database, run.id, error)
    throw error
  }
}

export async function manageRepositoryAction(
  input: ActionInput & { runId: number; intent: 'cancel' | 'rerun' },
) {
  const admission = input.allowCollaboratorExecution
    ? await input.repositoryAccess.resolve(
        input.user,
        input.owner,
        input.repo,
        input.branch,
        input.repoId,
      )
    : await requireRepositoryManager(input.repositoryAccess, input.user, input)
  const { api } = admission
  if (!admission.identity)
    throw new Error('Verified repository identity is required')
  const stored = await first<StoredActionRun>(
    input.database,
    `SELECT ${actionColumns} FROM action_run WHERE id = ? AND repository_id = ? AND ref = ? LIMIT 1`,
    [input.runId, admission.identity.applicationId, input.branch],
  )
  const row = stored && actionRun(stored)
  if (!row) throw new UserError('Action run not found')
  if (admission.tokenSource === 'installation') {
    const configured = await actionContext(input, {
      type: row.contextType as RepositoryActionContext['type'],
      name: row.contextName,
      path: row.contextPath,
      data: {},
    })
    const current = configured.actions.find(
      (action) => action.name === row.actionName,
    )
    if (
      !current ||
      (input.intent === 'rerun' &&
        (current.workflow !== row.workflow ||
          resolveActionRef(current.ref, input.branch) !== row.workflowRef))
    )
      throw new UserError('This action is no longer configured for this run')
  }

  const originalPayload = row.payload as {
    action?: { name?: string; label?: string; cancelable?: boolean }
    repository?: { ref?: string; workflowRef?: string }
    context?: {
      type?: string
      name?: string | null
      path?: string | null
      data?: Record<string, unknown>
    }
    inputs?: Record<string, string | number | boolean>
  }
  const triggeredBy = row.triggeredBy as { userId?: string }

  if (input.intent === 'cancel') {
    if (originalPayload.action?.cancelable === false) {
      throw new UserError('This action cannot be cancelled')
    }
    if (!input.user.githubUsername && triggeredBy.userId !== input.user.id) {
      throw new UserError('You can only cancel your own action runs')
    }
    if (row.status === 'completed')
      throw new UserError('This action has finished')
    if (row.workflowRunId === null) {
      throw new UserError('This action cannot be cancelled yet')
    }
    await api.cancelWorkflowRun(input.owner, input.repo, row.workflowRunId)
    const now = Date.now()
    const [updated] = await executeAtomic(input.database, [
      {
        sql: `UPDATE action_run SET status = 'completed', conclusion = 'cancelled', updated_at = ?,
        completed_at = ? WHERE id = ? RETURNING ${actionColumns}`,
        args: [now, now, row.id],
      },
    ])
    return summary(
      updated.rows[0] ? actionRun(updated.rows[0] as StoredActionRun) : row,
      input.user,
    )
  }

  if (!input.user.githubUsername && !input.allowCollaboratorExecution) {
    throw new UserError('Only GitHub users can run this action again')
  }
  const workflowRef = resolveActionRef(
    originalPayload.repository?.workflowRef ?? row.workflowRef,
    input.branch,
  )
  const sha = await api.getRefSha(input.owner, input.repo, workflowRef)
  const timestamp = new Date()
  const nextTriggeredBy = {
    userId: input.user.id,
    name: input.user.name,
    email: input.user.email,
    githubUsername: input.user.githubUsername,
    image: input.user.image ?? null,
  }
  const payload = {
    source: 'pages-cms',
    action: {
      name: originalPayload.action?.name ?? row.actionName,
      label: originalPayload.action?.label ?? row.actionName,
      cancelable: originalPayload.action?.cancelable ?? true,
    },
    repository: {
      owner: input.owner,
      repo: input.repo,
      ref: originalPayload.repository?.ref ?? row.ref,
      workflowRef,
      sha,
    },
    triggeredAt: timestamp.toISOString(),
    triggerType: 'rerun',
    rerunOfActionRunId: row.id,
    triggeredBy: nextTriggeredBy,
    context: {
      type: originalPayload.context?.type ?? row.contextType,
      name: originalPayload.context?.name ?? row.contextName,
      path: originalPayload.context?.path ?? row.contextPath,
      data: originalPayload.context?.data ?? {},
    },
    inputs: originalPayload.inputs ?? {},
  }
  const created = await insertActionRun(input.database, {
    repositoryId: admission.identity.applicationId,
    owner: input.owner,
    repo: input.repo,
    ref: payload.repository.ref,
    workflowRef,
    sha,
    actionName: payload.action.name,
    contextType: payload.context.type,
    contextName: payload.context.name,
    contextPath: payload.context.path,
    workflow: row.workflow,
    triggeredBy: nextTriggeredBy,
    payload,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  try {
    await api.dispatchWorkflow({
      owner: input.owner,
      repo: input.repo,
      workflow: row.workflow,
      ref: workflowRef,
      inputs: { payload: JSON.stringify(payload) },
    })
    return summary(await queueActionRun(input.database, created), input.user)
  } catch (error) {
    await failActionRun(input.database, created.id, error)
    throw error
  }
}

export async function readActionRunName(
  database: Database,
  input: {
    owner: string
    repo: string
    repoId?: string
    branch: string
    runId: number
  },
) {
  const repository = actionRepository(input)
  const row = await first<{ name: string }>(
    database,
    `SELECT action_name AS name FROM action_run WHERE id = ? AND repository_id = ${repository.sql} AND ref = ? LIMIT 1`,
    [input.runId, ...repository.args, input.branch],
  )
  if (!row) throw new UserError('Action run not found')
  return row.name
}
