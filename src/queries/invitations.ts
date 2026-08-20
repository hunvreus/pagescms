import { queryOptions } from '@tanstack/react-query'

import { getCollaboratorInvite } from '#/functions/collaborator-invite'

import { queryKeys, queryTimes } from './keys'

export function collaboratorInviteQueryOptions(token: string) {
  return queryOptions({
    queryKey: [...queryKeys.invitations(), token] as const,
    queryFn: () => getCollaboratorInvite({ data: token }),
    staleTime: 0,
    gcTime: queryTimes.minute,
  })
}
