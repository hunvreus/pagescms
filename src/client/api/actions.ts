import type {
  readActions as getActions,
  readActions as readActionsServer,
  runRepositoryAction,
  manageActionRun,
} from '#/server/services/actions'
import { apiMutation, readApi } from '#/client/api/index'
import type { trackedActionsRequest } from '#/shared/requests/action'

type Input = {
  owner: string
  repo: string
  repoId?: string
  branch: string
  includeRuns: boolean
}

export async function readActions(input: Input): ReturnType<typeof getActions> {
  const params = new URLSearchParams({
    owner: input.owner,
    repo: input.repo,
    branch: input.branch,
    includeRuns: String(input.includeRuns),
  })
  if (input.repoId) params.set('repoId', input.repoId)
  return readApi(`/api/actions?${params}`)
}

export const getActionRunStatuses = apiMutation<
  unknown,
  Array<
    ReturnType<typeof trackedActionsRequest>[number] & {
      runs: Awaited<ReturnType<typeof readActionsServer>>['runs']
    }
  >
>('/api/actions/statuses')
export const runAction = apiMutation<
  unknown,
  Awaited<ReturnType<typeof runRepositoryAction>>
>('/api/action-runs')
export const manageAction = apiMutation<
  unknown,
  Awaited<ReturnType<typeof manageActionRun>>
>('/api/action-runs', 'PATCH')
