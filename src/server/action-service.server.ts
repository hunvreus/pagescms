import { and, desc, eq, isNotNull, ne } from 'drizzle-orm'

import {
  repositoryActions,
  resolveActionRef,
  schemaActions,
  validateActionInputs,
} from '#/lib/actions'
import { findContentSchema, findMediaSchema } from '#/lib/configuration-content'
import { normalizeGitPath } from '#/lib/git-path'

import { createConfigurationStore } from './configuration-store.server'

import type { Database } from './database/client.server'
import type { ProjectUser } from './projects.server'
import type { RepositoryAccessService } from './repository-access.server'

import { actionRunTable } from './database/schema'

type ActionInput = {
  database: Database
  repositoryAccess: RepositoryAccessService
  user: ProjectUser & { name: string; image?: string | null }
  owner: string
  repo: string
  branch: string
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
  if (!context.name) throw new Error('Action context name is required')
  const schema =
    context.type === 'media'
      ? findMediaSchema(configuration, context.name)
      : findContentSchema(configuration, context.name)
  if (!schema) throw new Error(`Action context ${context.name} was not found`)
  if (context.type === 'collection' && schema.type !== 'collection') {
    throw new Error('Collection action context is invalid')
  }
  if (context.type === 'entry' && schema.type !== 'collection') {
    throw new Error('Entry action context is invalid')
  }
  if (context.type === 'file' && schema.type !== 'file') {
    throw new Error('File action context is invalid')
  }
  const rootValue = context.type === 'media' ? schema.input : schema.path
  if (typeof rootValue !== 'string') {
    throw new Error('Action context root is invalid')
  }
  const root = normalizeGitPath(rootValue)
  const path = normalizeGitPath(context.path ?? root)
  if (path !== root && !path.startsWith(`${root}/`)) {
    throw new Error('Action context path is outside its configured root')
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
  const { api } = await input.repositoryAccess.resolve(
    input.user,
    input.owner,
    input.repo,
    input.branch,
  )
  const configuration = await createConfigurationStore({
    database: input.database,
  }).get(api, input.owner, input.repo, input.branch)
  if (!configuration) throw new Error('Repository configuration not found')
  return {
    api,
    actions: configuredActions(configuration.object, context),
  }
}

function summary(
  row: typeof actionRunTable.$inferSelect,
  user: ActionInput['user'],
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
    },
    canCancel:
      row.status !== 'completed' &&
      row.workflowRunId !== null &&
      (user.githubUsername !== null || triggeredBy.userId === user.id) &&
      ((row.payload as { action?: { cancelable?: boolean } }).action
        ?.cancelable ??
        true),
    canRerun: user.githubUsername !== null,
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
  try {
    if (row.workflowRunId === null) {
      const claimedRows = await input.database
        .select({ workflowRunId: actionRunTable.workflowRunId })
        .from(actionRunTable)
        .where(
          and(
            eq(actionRunTable.owner, row.owner),
            eq(actionRunTable.repo, row.repo),
            eq(actionRunTable.workflow, row.workflow),
            eq(actionRunTable.workflowRef, row.workflowRef),
            isNotNull(actionRunTable.workflowRunId),
            ne(actionRunTable.id, row.id),
          ),
        )
      const claimed = new Set(
        claimedRows.flatMap((value) =>
          value.workflowRunId === null ? [] : [value.workflowRunId],
        ),
      )
      const startedAt = row.createdAt.getTime() - 30_000
      const workflowRun = (
        await api.listWorkflowRuns({
          owner: row.owner,
          repo: row.repo,
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
      const updated = await input.database
        .update(actionRunTable)
        .set({
          workflowRunId: workflowRun.id,
          status: workflowRun.status,
          conclusion: workflowRun.conclusion,
          htmlUrl: workflowRun.htmlUrl,
          updatedAt: new Date(),
          completedAt:
            workflowRun.status === 'completed'
              ? new Date(workflowRun.updatedAt)
              : null,
        })
        .where(eq(actionRunTable.id, row.id))
        .returning()
      return updated[0] ?? row
    }

    const workflowRun = await api.getWorkflowRun(
      row.owner,
      row.repo,
      row.workflowRunId,
    )
    const updated = await input.database
      .update(actionRunTable)
      .set({
        status: workflowRun.status,
        conclusion: workflowRun.conclusion,
        htmlUrl: workflowRun.htmlUrl,
        updatedAt: new Date(),
        completedAt:
          workflowRun.status === 'completed'
            ? new Date(workflowRun.updatedAt)
            : null,
      })
      .where(eq(actionRunTable.id, row.id))
      .returning()
    return updated[0] ?? row
  } catch {
    return row
  }
}

export async function loadRepositoryActions(input: ActionInput) {
  const { actions, api } = await actionContext(input)
  const rows = await input.database
    .select()
    .from(actionRunTable)
    .where(
      and(
        eq(actionRunTable.owner, input.owner),
        eq(actionRunTable.repo, input.repo),
        eq(actionRunTable.ref, input.branch),
      ),
    )
    .orderBy(desc(actionRunTable.createdAt))
    .limit(100)
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
      summary(synchronized.get(row.id) ?? row, input.user),
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
  const { api, actions } = await actionContext(input, input.context)
  const action = actions.find((value) => value.name === input.actionName)
  if (!action) throw new Error(`Action ${input.actionName} was not found`)
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
  const rows = await input.database
    .insert(actionRunTable)
    .values({
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
      status: 'dispatching',
      triggeredBy,
      payload,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .returning()
  const run = rows.at(0)
  if (!run) throw new Error('Could not record action run')
  try {
    await api.dispatchWorkflow({
      owner: input.owner,
      repo: input.repo,
      workflow: action.workflow,
      ref: workflowRef,
      inputs: { payload: JSON.stringify(payload) },
    })
    const updated = await input.database
      .update(actionRunTable)
      .set({ status: 'queued', updatedAt: new Date() })
      .where(eq(actionRunTable.id, run.id))
      .returning()
    return summary(updated[0] ?? run, input.user)
  } catch (error) {
    await input.database
      .update(actionRunTable)
      .set({
        status: 'completed',
        conclusion: 'failure',
        failure: {
          message: error instanceof Error ? error.message : 'Dispatch failed',
        },
        updatedAt: new Date(),
        completedAt: new Date(),
      })
      .where(eq(actionRunTable.id, run.id))
    throw error
  }
}

export async function manageRepositoryAction(
  input: ActionInput & { runId: number; intent: 'cancel' | 'rerun' },
) {
  const { api } = await input.repositoryAccess.resolve(
    input.user,
    input.owner,
    input.repo,
    input.branch,
  )
  const rows = await input.database
    .select()
    .from(actionRunTable)
    .where(
      and(
        eq(actionRunTable.id, input.runId),
        eq(actionRunTable.owner, input.owner),
        eq(actionRunTable.repo, input.repo),
        eq(actionRunTable.ref, input.branch),
      ),
    )
    .limit(1)
  const row = rows.at(0)
  if (!row) throw new Error('Action run not found')

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
      throw new Error('This action cannot be cancelled')
    }
    if (!input.user.githubUsername && triggeredBy.userId !== input.user.id) {
      throw new Error('You can only cancel your own action runs')
    }
    if (row.status === 'completed') throw new Error('This action has finished')
    if (row.workflowRunId === null) {
      throw new Error('This action cannot be cancelled yet')
    }
    await api.cancelWorkflowRun(row.owner, row.repo, row.workflowRunId)
    const updated = await input.database
      .update(actionRunTable)
      .set({
        status: 'completed',
        conclusion: 'cancelled',
        updatedAt: new Date(),
        completedAt: new Date(),
      })
      .where(eq(actionRunTable.id, row.id))
      .returning()
    return summary(updated[0] ?? row, input.user)
  }

  if (!input.user.githubUsername) {
    throw new Error('Only GitHub users can run this action again')
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
  const createdRows = await input.database
    .insert(actionRunTable)
    .values({
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
      status: 'dispatching',
      triggeredBy: nextTriggeredBy,
      payload,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .returning()
  const created = createdRows.at(0)
  if (!created) throw new Error('Could not record action run')
  try {
    await api.dispatchWorkflow({
      owner: input.owner,
      repo: input.repo,
      workflow: row.workflow,
      ref: workflowRef,
      inputs: { payload: JSON.stringify(payload) },
    })
    const updated = await input.database
      .update(actionRunTable)
      .set({ status: 'queued', updatedAt: new Date() })
      .where(eq(actionRunTable.id, created.id))
      .returning()
    return summary(updated[0] ?? created, input.user)
  } catch (error) {
    await input.database
      .update(actionRunTable)
      .set({
        status: 'completed',
        conclusion: 'failure',
        failure: {
          message: error instanceof Error ? error.message : 'Dispatch failed',
        },
        updatedAt: new Date(),
        completedAt: new Date(),
      })
      .where(eq(actionRunTable.id, created.id))
    throw error
  }
}
