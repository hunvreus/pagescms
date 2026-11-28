import { useEffect } from 'react'
import { msg } from '@lingui/core/macro'
import { translateMessage } from '#/i18n/message'
import { pageTitle } from '#/lib/page-title'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'

import { RepositoryDashboard } from '#/features/dashboard/repository-dashboard'
import { RepositoryDashboardSkeleton } from '#/features/dashboard/repository-loading'
import { SignInPage } from '#/features/account/sign-in-page'
import { checkConfirmedProfile } from '#/features/account/require-profile'
import {
  authenticationQueryOptions,
  dashboardQueryOptions,
} from '#/client/queries/session'

export const Route = createFileRoute('/')({
  loader: async ({ context }) => {
    const auth = await context.queryClient.ensureQueryData(
      authenticationQueryOptions(),
    )
    if (!auth.user) return { methods: auth.methods }
    checkConfirmedProfile(auth, '/')
    return { methods: null, userId: auth.user.id }
  },
  pendingMs: 120,
  pendingComponent: RepositoryDashboardSkeleton,
  component: Home,
  head: ({ matches }) =>
    pageTitle(
      translateMessage(
        matches[0].context.i18n,
        matches.at(-1)?.loaderData?.methods
          ? msg({ message: 'Sign in' })
          : msg({ message: 'Projects' }),
      ),
    ),
})

function Home() {
  const { methods, userId } = Route.useLoaderData()
  if (methods) return <SignInPage callbackUrl="/" email="" methods={methods} />
  return userId ? <Dashboard userId={userId} /> : null
}

function Dashboard({ userId }: { userId: string }) {
  const { data, error } = useQuery({
    ...dashboardQueryOptions(),
    retry: (failures, failure) =>
      failure.message !== 'Authentication required' && failures < 3,
  })
  const sessionExpired = error?.message === 'Authentication required'
  const accountChanged = Boolean(data && data.user.id !== userId)
  useEffect(() => {
    if (sessionExpired) window.location.replace('/sign-in')
    else if (accountChanged) window.location.reload()
  }, [sessionExpired, accountChanged])
  if (sessionExpired || accountChanged) return null
  if (error && !data) throw error
  return data ? (
    <RepositoryDashboard {...data} />
  ) : (
    <RepositoryDashboard pendingUserId={userId} />
  )
}
