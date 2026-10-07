import { NO_CONFIGURED_BRANCHES } from '#/lib/repository-access-errors'
import { Link } from '@tanstack/react-router'

import { Button } from '#/components/ui/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '#/components/ui/empty'
import { logServerEvent, serverErrorDetails } from '#/server/http'

import type { ErrorComponentProps } from '@tanstack/react-router'

export function RootError({ error, reset }: ErrorComponentProps) {
  if (typeof window === 'undefined') {
    logServerEvent('error', {
      event: 'route_render_failed',
      ...serverErrorDetails(error),
    })
  }

  const noConfiguredBranches = error.message === NO_CONFIGURED_BRANCHES

  return (
    <main className="flex min-h-screen items-center justify-center p-4 md:p-6">
      <Empty className="max-w-sm">
        <EmptyHeader>
          <EmptyTitle>
            {noConfiguredBranches
              ? 'No configured branches available'
              : 'Something went wrong'}
          </EmptyTitle>
          <EmptyDescription>
            {noConfiguredBranches
              ? 'Contact the repository administrator to configure a branch or grant access.'
              : "We couldn't load this page. Try again or return to your projects."}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <div className="flex items-center gap-2">
            {noConfiguredBranches ? null : (
              <Button onClick={reset} type="button">
                Try again
              </Button>
            )}
            <Button asChild variant="outline">
              <Link to="/">Back to projects</Link>
            </Button>
          </div>
        </EmptyContent>
      </Empty>
    </main>
  )
}
