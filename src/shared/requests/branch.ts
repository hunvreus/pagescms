import { branchName, repositoryRef } from '#/lib/repository'

export function parseBranchCreate(input: unknown) {
  if (typeof input !== 'object' || input === null) {
    throw new Error('Invalid branch creation')
  }
  const value = input as Record<string, unknown>
  if (
    typeof value.owner !== 'string' ||
    typeof value.repo !== 'string' ||
    typeof value.branch !== 'string' ||
    typeof value.source !== 'string'
  ) {
    throw new Error('Invalid branch creation')
  }
  return {
    ...repositoryRef({
      owner: value.owner,
      repo: value.repo,
      repoId: value.repoId,
    }),
    branch: branchName(value.branch),
    source: branchName(value.source),
  }
}
