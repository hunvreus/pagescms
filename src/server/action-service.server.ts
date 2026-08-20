import { and, desc, eq } from 'drizzle-orm'

import {
  repositoryActions,
  resolveActionRef,
  validateActionInputs,
} from '#/lib/actions'

import { createConfigurationStore } from './configuration-store.server'

import type { Database } from './database/client.server'
import type { ProjectUser } from './projects.server'
import type { RepositoryAccessService } from './repository-access.server'
import type { BackgroundExecutor } from './runtime-ports.server'

import { actionRunTable } from './database/schema'

type ActionInput = {
  database: Database
  background: BackgroundExecutor
  repositoryAccess: RepositoryAccessService
  user: ProjectUser & { name: string; image?: string | null }
  owner: string
  repo: string
  branch: string
}

async function actionContext(input: ActionInput) {
  const { api } = await input.repositoryAccess.resolve(
    input.user,
    input.owner,
    input.repo,
    input.branch,
  )
  const configuration = await createConfigurationStore({
    database: input.database,
    background: input.background,
  }).get(api, input.owner, input.repo, input.branch)
  if (!configuration) throw new Error('Repository configuration not found')
  return {
    api,
    actions: repositoryActions(configuration.object),
  }
}

function summary(row: typeof actionRunTable.$inferSelect) {
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
    workflowRef: row.workflowRef,
    sha: row.sha,
    triggeredBy: {
      id: triggeredBy.userId ?? null,
      name: triggeredBy.name ?? triggeredBy.email ?? 'Unknown user',
    },
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  }
}

export async function loadRepositoryActions(input: ActionInput) {
  const { actions } = await actionContext(input)
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
  return { actions, runs: rows.map(summary) }
}

export async function dispatchRepositoryAction(
  input: ActionInput & { actionName: string; inputs: Record<string, unknown> },
) {
  const { api, actions } = await actionContext(input)
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
    context: { type: 'repository', name: null, path: null, data: {} },
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
      contextType: 'repository',
      contextName: null,
      contextPath: null,
      workflow: action.workflow,
      status: 'dispatching',
      triggeredBy,
      payload,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .returning()
  const run = rows[0]
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
    return summary(updated[0] ?? run)
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
