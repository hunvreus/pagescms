import { branchName, repositoryRef } from '#/lib/repository'
import { activityPageSize, activityRetention } from '#/lib/activity'

export function parseActivityRequest(input: unknown) {
  if (!input || typeof input !== 'object')
    throw new Error('Invalid activity request')
  const value = input as Record<string, unknown>
  if (
    typeof value.owner !== 'string' ||
    typeof value.repo !== 'string' ||
    typeof value.branch !== 'string'
  )
    throw new Error('Invalid activity request')
  const page = value.page ?? 0
  if (
    typeof page !== 'number' ||
    !Number.isInteger(page) ||
    page < 0 ||
    page >= activityRetention / activityPageSize
  )
    throw new Error('Invalid activity page')
  return {
    ...repositoryRef({
      owner: value.owner,
      repo: value.repo,
      repoId: value.repoId,
    }),
    branch: branchName(value.branch),
    page,
  }
}
