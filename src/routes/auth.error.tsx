import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'

import { Button } from '#/components/ui/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '#/components/ui/empty'
import { getAuthenticationErrorMessage } from '#/lib/auth-error'

interface AuthenticationErrorSearch {
  error?: string
}

export const Route = createFileRoute('/auth/error')({
  validateSearch: (
    search: Record<string, unknown>,
  ): AuthenticationErrorSearch => ({
    error: typeof search.error === 'string' ? search.error : undefined,
  }),
  component: AuthenticationErrorPage,
})

function AuthenticationErrorPage() {
  const { error } = Route.useSearch()

  return (
    <main className="flex min-h-screen items-center justify-center p-4 md:p-6">
      <Empty className="max-w-xs p-0">
        <EmptyHeader>
          <EmptyTitle>We couldn&rsquo;t sign you in</EmptyTitle>
          <EmptyDescription>
            {getAuthenticationErrorMessage(error)}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button asChild>
            <Link to="/sign-in">
              <ArrowLeft data-icon="inline-start" />
              Back to sign in
            </Link>
          </Button>
        </EmptyContent>
      </Empty>
    </main>
  )
}
