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

  return (
    <main className="flex min-h-screen items-center justify-center p-4 md:p-6">
      <Empty className="max-w-sm">
        <EmptyHeader>
          <EmptyTitle>Something went wrong</EmptyTitle>
          <EmptyDescription>
            We couldn&apos;t load this page. Try again or return to your
            projects.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <div className="flex items-center gap-2">
            <Button onClick={reset} type="button">
              Try again
            </Button>
            <Button asChild variant="outline">
              <Link to="/">Back to projects</Link>
            </Button>
          </div>
        </EmptyContent>
      </Empty>
    </main>
  )
}
