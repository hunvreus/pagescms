import { parseActivityRequest } from '#/shared/requests/activity'
import { readApi } from '#/client/api/index'
import type { readActivity } from '#/server/services/activity'

type Input = unknown

export function getActivity(input: Input): ReturnType<typeof readActivity> {
  const data = parseActivityRequest(input)
  const query = new URLSearchParams({
    owner: data.owner,
    repo: data.repo,
    branch: data.branch,
    page: String(data.page),
  })
  if (data.repoId) query.set('repoId', data.repoId)
  return readApi(`/api/activity?${query}`)
}
