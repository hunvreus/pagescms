import { normalizeGitPath } from '#/shared/git-path'
import { repositoryRef } from '#/lib/repository'
import { historyPage } from '#/lib/file-history'

export function parseEntryRequest(input: unknown) {
  if (typeof input !== 'object' || input === null)
    throw new Error('Invalid entry request')
  const value = input as Record<string, unknown>
  if (
    typeof value.owner !== 'string' ||
    typeof value.repo !== 'string' ||
    typeof value.branch !== 'string' ||
    typeof value.name !== 'string' ||
    typeof value.path !== 'string'
  ) {
    throw new Error('Invalid entry request')
  }
  return {
    ...repositoryRef({
      owner: value.owner,
      repo: value.repo,
      repoId: value.repoId,
    }),
    branch: value.branch,
    name: value.name,
    path: normalizeGitPath(value.path),
  }
}

export function parseEntryHistory(input: unknown) {
  return {
    ...parseEntryRequest(input),
    page: historyPage((input as Record<string, unknown>).page),
  }
}
