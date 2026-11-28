import type {
  readConfiguration as getServer,
  writeConfiguration,
  readConfigurationHistory,
} from '#/server/services/configuration'
import { configurationCoordinates } from '#/shared/requests/configuration'
import { apiMutation, readApi } from '#/client/api/index'

function query(input: unknown) {
  const data = configurationCoordinates(input)
  const params = new URLSearchParams({
    owner: data.owner,
    repo: data.repo,
    branch: data.branch,
  })
  if (data.repoId) params.set('repoId', data.repoId)
  return params
}

export function getConfigurationEditor(
  input: Parameters<typeof getServer>[2],
): ReturnType<typeof getServer> {
  return readApi(`/api/configuration?${query(input)}`)
}

export function getConfigurationHistory(
  input: unknown,
): ReturnType<typeof readConfigurationHistory> {
  const params = query(input)
  const data = input as { page?: number }
  if (data.page !== undefined) params.set('page', String(data.page))
  return readApi(`/api/configuration/history?${params}`)
}

export const updateConfiguration = apiMutation<
  unknown,
  Awaited<ReturnType<typeof writeConfiguration>>
>('/api/configuration')
