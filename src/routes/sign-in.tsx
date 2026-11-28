import { msg } from '@lingui/core/macro'
import { translateMessage } from '#/i18n/message'
import { pageTitle } from '#/lib/page-title'
import { useCallback } from 'react'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'

import { SignInPage } from '#/features/account/sign-in-page'
import { getSafeRedirect } from '#/lib/auth-redirect'
import { authenticationQueryOptions } from '#/client/queries/session'
import { profileSetupHref } from '#/features/account/require-profile'

export interface SignInSearch {
  redirect?: string
  email?: string
  error?: string
  deleted?: boolean
}

export const Route = createFileRoute('/sign-in')({
  validateSearch: (search: Record<string, unknown>): SignInSearch => ({
    redirect: typeof search.redirect === 'string' ? search.redirect : undefined,
    email: typeof search.email === 'string' ? search.email : undefined,
    error: typeof search.error === 'string' ? search.error : undefined,
    deleted:
      search.deleted === true || search.deleted === 'true' ? true : undefined,
  }),
  loaderDeps: ({ search }) => ({ redirect: search.redirect }),
  loader: async ({ context, deps }) => {
    const authentication = await context.queryClient.ensureQueryData(
      authenticationQueryOptions(),
    )
    const destination = getSafeRedirect(deps.redirect)
    if (authentication.user) {
      if (!authentication.profileCompleted)
        throw redirect({ href: profileSetupHref(destination), replace: true })
      throw redirect({ href: destination === '/sign-in' ? '/' : destination })
    }
  },
  component: SignIn,
  head: ({ matches }) =>
    pageTitle(
      translateMessage(matches[0].context.i18n, msg({ message: 'Sign in' })),
    ),
})

function SignIn() {
  const { data: authentication } = useSuspenseQuery(
    authenticationQueryOptions(),
  )
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const clearDeletionNotice = useCallback(() => {
    void navigate({
      search: (current) => ({ ...current, deleted: undefined }),
      replace: true,
    })
  }, [navigate])
  const callbackUrl = getSafeRedirect(search.redirect)

  return (
    <SignInPage
      callbackUrl={callbackUrl}
      email={search.email?.trim().toLowerCase() ?? ''}
      error={search.error}
      deleted={search.deleted}
      methods={authentication.methods}
      onDeletionNoticeShown={clearDeletionNotice}
    />
  )
}
