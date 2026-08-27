import { createFileRoute, redirect } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'

import { SignInForm } from '#/components/sign-in-form'
import { getSafeRedirect } from '#/lib/auth-redirect'
import { authenticationQueryOptions } from '#/queries/session'

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
  loader: async ({ context, deps }) => {
    const authentication = await context.queryClient.ensureQueryData(
      authenticationQueryOptions(),
    )
    const destination = getSafeRedirect(deps.redirect)
    if (authentication.user) {
      throw redirect({ href: destination === '/sign-in' ? '/' : destination })
    }
  },
  pendingMs: 150,
  pendingComponent: SignInSkeleton,
  component: SignInPage,
})

function SignInPage() {
  const { data: authentication } = useSuspenseQuery(
    authenticationQueryOptions(),
  )
  const search = Route.useSearch()
  const callbackUrl = getSafeRedirect(search.redirect)

  return (
    <main className="flex min-h-screen items-center justify-center p-4 md:p-6">
      <div className="w-full max-w-xs">
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
      className="flex min-h-screen items-center justify-center p-4 md:p-6"
      aria-label="Loading sign in"
    >
      <div className="w-full max-w-xs animate-pulse space-y-6">
        <div className="mx-auto h-6 w-48 rounded bg-muted" />
        <div className="h-10 rounded-lg bg-muted" />
        <div className="h-10 rounded-lg bg-muted" />
      </div>
    </main>
  )
}
