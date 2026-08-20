import { Link, createFileRoute, redirect } from '@tanstack/react-router'

import { Button } from '#/components/ui/button'

export const Route = createFileRoute('/sign-in/collaborator')({
  validateSearch: (search: Record<string, unknown>) => ({
    token:
      typeof search.token === 'string' && search.token.trim()
        ? search.token.trim()
        : undefined,
  }),
  beforeLoad: ({ search }) => {
    if (search.token) {
      throw redirect({
        to: '/invite/$token',
        params: { token: search.token },
        replace: true,
      })
    }
  },
  component: InvalidCollaboratorInvite,
})

function InvalidCollaboratorInvite() {
  return (
    <main className="flex min-h-screen items-center justify-center px-5">
      <section className="max-w-sm space-y-4 text-center">
        <h1 className="text-xl font-semibold">Invite unavailable</h1>
        <p className="text-sm text-muted-foreground">
          This invitation link is invalid.
        </p>
        <Button asChild variant="outline">
          <Link to="/sign-in">Go to sign in</Link>
        </Button>
      </section>
    </main>
  )
}
