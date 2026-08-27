import { Link, createFileRoute, redirect } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'

import { Button } from '#/components/ui/button'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '#/components/ui/empty'
import { collaboratorInviteQueryOptions } from '#/queries/invitations'

export const Route = createFileRoute('/invite/$token')({
  loader: async ({ context, params }) => {
    const state = await context.queryClient.ensureQueryData(
      collaboratorInviteQueryOptions(params.token),
    )
    if (state.status === 'ready') throw redirect({ href: state.destination })
  },
  component: InvitePage,
})

function InvitePage() {
  const params = Route.useParams()
  const { data: state } = useSuspenseQuery(
    collaboratorInviteQueryOptions(params.token),
  )
  if (state.status === 'sign-in' || state.status === 'wrong-account') {
    return (
      <main className="flex min-h-screen items-center justify-center p-4 md:p-6">
        <div className="w-full max-w-xs space-y-6 text-center">
          <header className="space-y-2">
            <h1 className="text-lg font-medium tracking-tight">
              Repository invitation
            </h1>
            {state.status === 'sign-in' ? (
              <p className="text-sm leading-6 text-muted-foreground">
                Sign in as {state.maskedEmail} to accept this invitation.
              </p>
            ) : (
              <p className="text-sm leading-6 text-destructive">
                This invitation belongs to a different verified email address.
              </p>
            )}
          </header>
          {state.status === 'sign-in' ? (
            <Button asChild className="w-full" size="lg">
              <Link
                search={{
                  email: state.email,
                  redirect: `/invite/${encodeURIComponent(params.token)}`,
                }}
                to="/sign-in"
              >
                Sign in to accept
              </Link>
            </Button>
          ) : null}
        </div>
      </main>
    )
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4 md:p-6">
      <Empty className="max-w-xs p-0">
        <EmptyHeader>
          <EmptyTitle>Invitation unavailable</EmptyTitle>
          <EmptyDescription>
            This invitation is invalid, expired, or has already been used.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </main>
  )
}
