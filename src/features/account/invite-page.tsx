import { Link, getRouteApi } from '@tanstack/react-router'
import { useMutation, useSuspenseQuery } from '@tanstack/react-query'

import { ErrorAlert } from '#/components/error-alert'
import { Button } from '#/components/ui/button'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '#/components/ui/empty'
import { collaboratorInviteQueryOptions } from '#/queries/invitations'
import { acceptCollaboratorInvitation } from '#/functions/collaborator-invite'
import { OperationError } from '#/components/operation-error'

const route = getRouteApi('/invite/$token')

export function InvitePage() {
  const params = route.useParams()
  const navigate = route.useNavigate()
  const acceptance = useMutation({
    mutationFn: () => acceptCollaboratorInvitation({ data: params.token }),
    onSuccess: (state) => void navigate({ to: state.destination }),
  })
  const { data: state } = useSuspenseQuery(
    collaboratorInviteQueryOptions(params.token),
  )
  if (
    state.status === 'sign-in' ||
    state.status === 'wrong-account' ||
    state.status === 'ready'
  ) {
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
            ) : state.status === 'wrong-account' ? (
              <ErrorAlert>
                This invitation belongs to a different verified email address.
              </ErrorAlert>
            ) : (
              <p className="text-sm text-muted-foreground">
                Accept this invitation to open the repository.
              </p>
            )}
          </header>
          {state.status === 'sign-in' ? (
            <Button asChild className="w-full" size="lg">
              <Link
                search={{
                  redirect: `/invite/${encodeURIComponent(params.token)}`,
                }}
                to="/sign-in"
              >
                Sign in to accept
              </Link>
            </Button>
          ) : null}
          {state.status === 'ready' ? (
            <Button
              className="w-full"
              disabled={acceptance.isPending}
              onClick={() => acceptance.mutate()}
            >
              Accept invitation
            </Button>
          ) : null}
          {acceptance.error ? (
            <OperationError error={acceptance.error} />
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
