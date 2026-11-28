import {
  knownRepositoryIdentity,
  repositoryIdentityKey,
} from '#/lib/repository-identity'
import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { listOverviewEntries } from '#/features/drafts/draft-store'
import { connectDraftReadCache } from '#/features/drafts/draft-read-cache'
import { queryTimes } from '#/client/queries/keys'

export function useOverviewFiles(
  account: string | undefined,
  source: string | undefined,
  coordinates: { owner: string; repo: string; branch: string; repoId?: string },
) {
  const client = useQueryClient()
  const { owner, repo, branch } = coordinates
  const key = [
    'pagescms',
    'overview-files',
    account,
    source,
    repositoryIdentityKey({ ...coordinates, source }),
    branch,
  ]
  const query = useQuery({
    queryKey: key,
    enabled: Boolean(account && source),
    queryFn: async () => {
      if (!account || !source) return { drafts: [], visits: [] }
      const repoId =
        coordinates.repoId ??
        knownRepositoryIdentity({ ...coordinates, source })?.id
      if (repoId === undefined) return { drafts: [], visits: [] }
      const target = { owner, repo, branch, repoId: String(repoId) }
      const [drafts, visits] = await Promise.all([
        listOverviewEntries('summaries', account, target, source),
        listOverviewEntries('recent', account, target, source),
      ])
      return {
        drafts,
        visits,
      }
    },
    staleTime: Infinity,
    gcTime: queryTimes.gc,
    retry: false,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
  })
  useEffect(() => {
    if (!account || !source) return
    connectDraftReadCache()
    const refresh = () =>
      void client.invalidateQueries({
        queryKey: [
          'pagescms',
          'overview-files',
          account,
          source,
          repositoryIdentityKey({ ...coordinates, source }),
          branch,
        ],
        exact: true,
      })
    window.addEventListener('pagescms:drafts', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      window.removeEventListener('pagescms:drafts', refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [account, source, owner, repo, branch, client])
  return query
}
