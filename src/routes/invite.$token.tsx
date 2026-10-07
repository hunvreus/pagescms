import { createFileRoute } from '@tanstack/react-router'
import { InvitePage } from '#/features/account/invite-page'
import { collaboratorInviteQueryOptions } from '#/queries/invitations'

export const Route = createFileRoute('/invite/$token')({
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(
      collaboratorInviteQueryOptions(params.token),
    )
  },
  component: InvitePage,
})
