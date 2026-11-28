import { infiniteQueryOptions } from '@tanstack/react-query'
import { getEntryHistory } from '#/client/api/entries'
import { getConfigurationHistory } from '#/client/api/configuration'
import { repositoryRequest } from '#/lib/repository-identity'
import { HISTORY_PAGE_SIZE } from '#/lib/file-history'
import { queryKeys, queryTimes } from './keys'

export interface FileHistoryCoordinates {
  owner: string
  repo: string
  repoId?: string
  source?: string
  branch: string
  name: string
  path: string
  configuration?: boolean
}

export function fileHistoryQueryOptions(
  input: FileHistoryCoordinates,
  account: string | undefined,
) {
  const coordinates = repositoryRequest(input)
  return infiniteQueryOptions({
    queryKey: [
      ...queryKeys.branch(coordinates),
      'file-history',
      coordinates.path,
      account,
      coordinates.name,
      Boolean(coordinates.configuration),
    ] as const,
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      coordinates.configuration
        ? getConfigurationHistory({ ...coordinates, page: pageParam })
        : getEntryHistory({ ...coordinates, page: pageParam }),
    getNextPageParam: (page, _pages, pageParam) =>
      page.length === HISTORY_PAGE_SIZE ? pageParam + 1 : undefined,
    staleTime: queryTimes.minute,
    gcTime: queryTimes.gc,
    retry: false,
  })
}
