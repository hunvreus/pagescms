import { Link, createFileRoute, redirect } from '@tanstack/react-router'

import { Button } from '#/components/ui/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '#/components/ui/empty'

export const Route = createFileRoute('/sign-in_/collaborator')({
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
    <main className="flex min-h-screen items-center justify-center p-4 md:p-6">
      <Empty className="max-w-xs p-0">
        <EmptyHeader>
          <EmptyTitle>Invitation unavailable</EmptyTitle>
          <EmptyDescription>This invitation link is invalid.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button asChild>
            <Link to="/sign-in">Go to sign in</Link>
          </Button>
        </EmptyContent>
      </Empty>
    </main>
  )
}
