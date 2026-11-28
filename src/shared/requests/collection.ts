import { repositoryRef } from '#/lib/repository'

export function parseCollectionRequest(input: unknown) {
  if (typeof input !== 'object' || input === null) {
    throw new Error('Invalid collection request')
  }
  const value = input as Record<string, unknown>
  if (
    typeof value.owner !== 'string' ||
    typeof value.repo !== 'string' ||
    typeof value.branch !== 'string' ||
    !value.branch ||
    typeof value.name !== 'string' ||
    !value.name ||
    value.name.includes('/')
  ) {
    throw new Error('Invalid collection request')
  }
  const repository = repositoryRef({
    owner: value.owner,
    repo: value.repo,
    repoId: value.repoId,
  })
  return {
    ...repository,
    branch: value.branch,
    name: value.name,
    locale: typeof value.locale === 'string' ? value.locale : undefined,
    path: typeof value.path === 'string' && value.path ? value.path : undefined,
    forceRefresh: value.forceRefresh === true || value.forceRefresh === 'true',
  }
}
