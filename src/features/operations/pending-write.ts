import type { QueryClient } from '@tanstack/react-query'

type Coordinates = {
  owner: string
  repo: string
  branch: string
  path?: string
}
type Write = {
  account?: string
  coordinates?: Coordinates
  paths?: string[]
  destination?: string
}
// Different views can refer to the same physical file (content, configuration,
// or media). The lock belongs to its path rather than its field definition.
export function hasPendingPathWrite(
  client: QueryClient,
  account: string,
  coordinates: Coordinates,
  paths: string[],
) {
  if (!paths.length) return false
  return client
    .getMutationCache()
    .findAll({ status: 'pending' })
    .some((mutation) => {
      const write = mutation.state.variables as Write | undefined
      const target = write?.coordinates
      if (
        write?.account !== account ||
        !target ||
        target.owner.toLowerCase() !== coordinates.owner.toLowerCase() ||
        target.repo.toLowerCase() !== coordinates.repo.toLowerCase() ||
        target.branch !== coordinates.branch
      )
        return false
      const locked = [...(write.paths ?? []), target.path, write.destination]
      return paths.some((path) => locked.includes(path))
    })
}
