import { Link, createFileRoute, redirect } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'

import { Button } from '#/components/ui/button'
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
  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-12">
      <div className="w-full max-w-md space-y-5 rounded-xl border bg-card p-6 text-center shadow-xs">
        <h1 className="text-xl font-semibold">Repository invitation</h1>
        {state.status === 'sign-in' ? (
          <>
            <p className="text-sm text-muted-foreground">
              Sign in as {state.maskedEmail} to accept this invitation.
            </p>
            <Button asChild>
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
          </>
        ) : state.status === 'wrong-account' ? (
          <p className="text-sm text-destructive">
            This invitation belongs to a different verified email address.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            This invitation is invalid, expired, or has already been used.
          </p>
        )}
      </div>
    </main>
  )
}
