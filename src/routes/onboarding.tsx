import { msg } from '@lingui/core/macro'
import { translateMessage } from '#/i18n/message'
import { ProfileSetupLoading } from '#/features/account/profile-loading'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { ProfileSetup } from '#/features/account/profile-setup'
import { profileReturnUrl } from '#/features/account/require-profile'
import { getSignInUrl } from '#/lib/auth-redirect'
import { pageTitle } from '#/lib/page-title'
import { authenticationQueryOptions } from '#/client/queries/session'

export const Route = createFileRoute('/onboarding')({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect:
      typeof search.redirect === 'string'
        ? profileReturnUrl(search.redirect)
        : undefined,
  }),
  loaderDeps: ({ search }) => ({ redirect: search.redirect }),
  loader: async ({ context, deps, location }) => {
    const auth = await context.queryClient.ensureQueryData(
      authenticationQueryOptions(),
    )
    if (!auth.user) throw redirect({ href: getSignInUrl(location.href) })
    if (auth.profileCompleted)
      throw redirect({ href: profileReturnUrl(deps.redirect), replace: true })
  },
  pendingComponent: ProfileSetupLoading,
  pendingMs: 100,
  component: Onboarding,
  head: ({ matches }) =>
    pageTitle(
      translateMessage(
        matches[0].context.i18n,
        msg({ message: 'Confirm your details' }),
      ),
    ),
})

function Onboarding() {
  const { data: auth } = useSuspenseQuery(authenticationQueryOptions())
  const search = Route.useSearch()
  if (!auth.user) return null
  return (
    <ProfileSetup
      key={auth.user.id}
      user={auth.user}
      destination={profileReturnUrl(search.redirect)}
    />
  )
}
