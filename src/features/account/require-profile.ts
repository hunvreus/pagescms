import { redirect } from '@tanstack/react-router'
import { getSafeRedirect, getSignInUrl } from '#/lib/auth-redirect'
import { authenticationQueryOptions } from '#/client/queries/session'
import type { QueryClient } from '@tanstack/react-query'
import type { AuthenticationState } from '#/lib/authentication'

export function profileReturnUrl(value: unknown) {
  const href = getSafeRedirect(value)
  let path: string
  try {
    path = decodeURIComponent(new URL(href, 'https://pagescms.org').pathname)
  } catch {
    return '/'
  }
  return /^\/(onboarding|sign-in)(\/|$)/i.test(path) ? '/' : href
}

export function profileSetupHref(destination: string) {
  const href = profileReturnUrl(destination)
  return href === '/'
    ? '/onboarding'
    : `/onboarding?redirect=${encodeURIComponent(href)}`
}

export function checkConfirmedProfile(
  auth: AuthenticationState,
  destination: string,
) {
  if (!auth.user) throw redirect({ href: getSignInUrl(destination) })
  if (!auth.profileCompleted)
    throw redirect({ href: profileSetupHref(destination), replace: true })
}

export async function requireConfirmedProfile(
  client: QueryClient,
  destination: string,
) {
  const auth = await client.ensureQueryData(authenticationQueryOptions())
  checkConfirmedProfile(auth, destination)
}
