import { useMemo } from 'react'
import { useRouteContext } from '@tanstack/react-router'

export function useRepositoryCoordinates<
  T extends { owner: string; repo: string },
>(coordinates: T) {
  const identity = useRouteContext({
    from: '/github/$owner/$repo/$branch',
    select: (context) => context.repositoryIdentity,
  })
  return useMemo(
    () => ({ ...coordinates, ...identity }),
    [coordinates, identity],
  )
}
