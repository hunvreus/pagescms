import { useQuery } from '@tanstack/react-query'

import { mediaQueryOptions } from '#/client/queries/content'
import { useRepositoryGitHubLink } from './use-repository-github-link'

export function useMediaGitHubLink(
  context: {
    repoId?: string
    source?: string
    owner: string
    repo: string
    branch: string
  },
  media: { name: string; input: string } | undefined,
) {
  const allowed = useRepositoryGitHubLink()
  // Use the effective provider: plugins can redirect libraries even when the
  // configuration has no explicit storage reference.
  const provider = useQuery({
    ...mediaQueryOptions({
      ...context,
      name: media?.name ?? '',
      path: media?.input,
    }),
    enabled: allowed && !!media,
    select: (data) => data.media.provider,
  })
  return allowed && provider.data === 'github'
}
