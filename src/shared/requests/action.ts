import { repositoryRef } from '#/lib/repository'

export function actionCoordinates(input: unknown) {
  if (typeof input !== 'object' || input === null)
    throw new Error('Invalid action request')
  const value = input as Record<string, unknown>
  if (
    typeof value.owner !== 'string' ||
    typeof value.repo !== 'string' ||
    typeof value.branch !== 'string' ||
    !value.branch
  ) {
    throw new Error('Invalid action request')
  }
  return {
    ...repositoryRef({
      owner: value.owner,
      repo: value.repo,
      repoId: value.repoId,
    }),
    branch: value.branch,
  }
}

type ActionContextType =
  'repository' | 'collection' | 'entry' | 'file' | 'media'

function isActionContextType(value: unknown): value is ActionContextType {
  return (
    value === 'repository' ||
    value === 'collection' ||
    value === 'entry' ||
    value === 'file' ||
    value === 'media'
  )
}

export function dispatchRequest(input: unknown) {
  const repository = actionCoordinates(input)
  const value = input as Record<string, unknown>
  if (
    typeof value.actionName !== 'string' ||
    !value.actionName ||
    typeof value.inputs !== 'object' ||
    value.inputs === null ||
    Array.isArray(value.inputs)
  ) {
    throw new Error('Invalid action dispatch')
  }
  const contextValue = value.context
  let actionContext: {
    type: ActionContextType
    name: string | null
    path: string | null
    data: Record<string, unknown>
  } = {
    type: 'repository',
    name: null,
    path: null,
    data: {},
  }
  if (contextValue !== undefined) {
    if (
      typeof contextValue !== 'object' ||
      contextValue === null ||
      Array.isArray(contextValue)
    ) {
      throw new Error('Invalid action context')
    }
    const context = contextValue as Record<string, unknown>
    if (
      !isActionContextType(context.type) ||
      (context.name !== null && typeof context.name !== 'string') ||
      (context.path !== null && typeof context.path !== 'string') ||
      typeof context.data !== 'object' ||
      context.data === null ||
      Array.isArray(context.data)
    ) {
      throw new Error('Invalid action context')
    }
    actionContext = {
      type: context.type,
      name: context.name,
      path: context.path,
      data: context.data as Record<string, unknown>,
    }
  }
  return {
    ...repository,
    actionName: value.actionName,
    inputs: value.inputs as Record<string, unknown>,
    context: actionContext,
  }
}

export function managementRequest(input: unknown): ReturnType<
  typeof actionCoordinates
> & {
  runId: number
  intent: 'cancel' | 'rerun'
} {
  const repository = actionCoordinates(input)
  const value = input as Record<string, unknown>
  if (
    typeof value.runId !== 'number' ||
    !Number.isInteger(value.runId) ||
    value.runId <= 0 ||
    (value.intent !== 'cancel' && value.intent !== 'rerun')
  ) {
    throw new Error('Invalid action management request')
  }
  return {
    ...repository,
    runId: value.runId,
    intent: value.intent,
  }
}

export function trackedActionsRequest(input: unknown) {
  if (!Array.isArray(input) || !input.length || input.length > 20)
    throw new Error('Invalid tracked actions')
  let count = 0
  return input.map((value: unknown) => {
    const ref = actionCoordinates(value)
    const ids = (value as Record<string, unknown>).runIds
    if (
      !Array.isArray(ids) ||
      !ids.length ||
      !ids.every(
        (id) => typeof id === 'number' && Number.isInteger(id) && id > 0,
      )
    )
      throw new Error('Invalid tracked actions')
    count += ids.length
    if (count > 200) throw new Error('Too many tracked actions')
    return { ...ref, runIds: [...new Set(ids as number[])] }
  })
}
