import { repositoryRef } from '#/lib/repository'

export function parseFileRequest(input: unknown) {
  if (typeof input !== 'object' || input === null) {
    throw new Error('Invalid file request')
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
    throw new Error('Invalid file request')
  }
  return {
    ...repositoryRef({
      owner: value.owner,
      repo: value.repo,
      repoId: value.repoId,
    }),
    branch: value.branch,
    name: value.name,
    locale: typeof value.locale === 'string' ? value.locale : undefined,
  }
}
