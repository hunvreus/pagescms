import { createFileRoute, redirect } from '@tanstack/react-router'

import { SignInForm } from '#/components/sign-in-form'
import { getAuthenticationState } from '#/functions/auth'
import { getSafeRedirect } from '#/lib/auth-redirect'

interface SignInSearch {
  redirect?: string
  email?: string
  error?: string
}

export const Route = createFileRoute('/sign-in')({
  validateSearch: (search: Record<string, unknown>): SignInSearch => ({
    redirect: typeof search.redirect === 'string' ? search.redirect : undefined,
    email: typeof search.email === 'string' ? search.email : undefined,
    error: typeof search.error === 'string' ? search.error : undefined,
  }),
  loaderDeps: ({ search }) => ({ redirect: search.redirect }),
  loader: async ({ deps }) => {
    const authentication = await getAuthenticationState()
    const destination = getSafeRedirect(deps.redirect)
    if (authentication.user) {
      throw redirect({ href: destination === '/sign-in' ? '/' : destination })
    }
    return authentication
  },
  staleTime: 5_000,
  pendingMs: 150,
  pendingComponent: SignInSkeleton,
  component: SignInPage,
})

function SignInPage() {
  const authentication = Route.useLoaderData()
  const search = Route.useSearch()
  const callbackUrl = getSafeRedirect(search.redirect)

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">
        {search.error ? (
          <p className="mb-6 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {search.error}
          </p>
        ) : null}
        <SignInForm
          callbackUrl={callbackUrl}
          initialEmail={search.email?.trim().toLowerCase() ?? ''}
          methods={authentication.methods}
        />
      </div>
    </main>
  )
}

function SignInSkeleton() {
  return (
    <main
      className="flex min-h-screen items-center justify-center px-5 py-12"
      aria-label="Loading sign in"
    >
      <div className="w-full max-w-sm animate-pulse space-y-6">
        <div className="mx-auto size-10 rounded-xl bg-muted" />
        <div className="mx-auto h-6 w-48 rounded bg-muted" />
        <div className="h-10 rounded-lg bg-muted" />
        <div className="h-10 rounded-lg bg-muted" />
      </div>
    </main>
  )
}
