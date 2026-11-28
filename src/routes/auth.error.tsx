import { useLingui } from '@lingui/react'
import { localizeErrorMessage } from '#/i18n/errors'
import { msg } from '@lingui/core/macro'
import { translateMessage } from '#/i18n/message'
import { Trans as UiTrans } from '@lingui/react/macro'
import { pageTitle } from '#/lib/page-title'
import { Link, createFileRoute } from '@tanstack/react-router'

import { Button } from '#/components/ui/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '#/components/ui/empty'
import { getAuthenticationErrorMessage } from '#/lib/auth-error'

export interface AuthenticationErrorSearch {
  error?: string
}

export const Route = createFileRoute('/auth/error')({
  validateSearch: (
    search: Record<string, unknown>,
  ): AuthenticationErrorSearch => ({
    error: typeof search.error === 'string' ? search.error : undefined,
  }),
  component: AuthenticationErrorPage,
  head: ({ matches }) =>
    pageTitle(
      translateMessage(
        matches[0].context.i18n,
        msg({ message: 'Sign-in error' }),
      ),
    ),
})

function AuthenticationErrorPage() {
  const { error } = Route.useSearch()
  const { i18n } = useLingui()

  return (
    <main className="flex min-h-screen items-center justify-center p-4 md:p-6">
      <Empty className="max-w-xs p-0">
        <EmptyHeader>
          <EmptyTitle>
            <UiTrans>We couldn&rsquo;t sign you in</UiTrans>
          </EmptyTitle>
          <EmptyDescription>
            {localizeErrorMessage(i18n, getAuthenticationErrorMessage(error))}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button asChild size="sm">
            <Link to="/sign-in">
              <UiTrans>Back to sign in</UiTrans>
            </Link>
          </Button>
        </EmptyContent>
      </Empty>
    </main>
  )
}
