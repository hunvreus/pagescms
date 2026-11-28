import type { QueryClient } from '@tanstack/react-query'
import { repositoryQueryOptions } from './repository'

// Bootstrap keys use URLs, so invalidating an ID prefix alone would leave old
// address aliases with stale configuration or permission projections.
export function invalidateRepositories(
  client: QueryClient,
  input: { owner: string; repo: string; repoId?: string; source?: string },
) {
  const current = client.getQueryData(repositoryQueryOptions(input).queryKey)
  const id = input.repoId ?? current?.repository.id
  if (id === undefined)
    return client.invalidateQueries({
      queryKey: repositoryQueryOptions(input).queryKey,
    })
  return client.invalidateQueries({
    predicate: (query) => {
      if (query.queryKey.at(-1) !== 'details') return false
      const repositoryData = query.state.data as typeof current
      return (
        repositoryData?.source ===
          (input.source ?? current?.source ?? 'github.com') &&
        String(repositoryData.repository.id) === String(id)
      )
    },
  })
}
