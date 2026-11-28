import { repositoryRef } from '#/lib/repository'
import type { CacheAction } from '#/server/services/cache-management'

const cacheActions = new Set<CacheAction>([
  'clear-content',
  'clear-configuration',
  'clear-all',
])

export function coordinates(input: unknown) {
  if (typeof input !== 'object' || input === null)
    throw new Error('Invalid cache request')
  const value = input as Record<string, unknown>
  if (
    typeof value.owner !== 'string' ||
    typeof value.repo !== 'string' ||
    typeof value.branch !== 'string' ||
    !value.branch
  ) {
    throw new Error('Invalid cache request')
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

export function managementRequest(input: unknown) {
  const repository = coordinates(input)
  const action = (input as Record<string, unknown>).action
  if (typeof action !== 'string' || !cacheActions.has(action as CacheAction)) {
    throw new Error('Invalid cache action')
  }
  return { ...repository, action: action as CacheAction }
}

export function filesRequest(input: unknown) {
  const repository = coordinates(input)
  const page = (input as Record<string, unknown>).page
  if (
    typeof page !== 'number' ||
    !Number.isSafeInteger(page) ||
    page < 0 ||
    page > 100_000
  )
    throw new Error('Invalid cache page')
  const search = (input as Record<string, unknown>).search
  if (
    search !== undefined &&
    (typeof search !== 'string' || search.length > 500)
  )
    throw new Error('Invalid cache filter')
  return {
    ...repository,
    page,
    search: typeof search === 'string' ? search.trim() : '',
  }
}
