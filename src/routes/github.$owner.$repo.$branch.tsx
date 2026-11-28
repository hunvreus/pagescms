import {
  Link,
  Navigate,
  Outlet,
  createFileRoute,
  redirect,
  useRouterState,
} from '@tanstack/react-router'
import { Button } from '#/components/ui/button'
import { msg } from '@lingui/core/macro'
import { translateMessage } from '#/i18n/message'

import { Trans as UiTrans } from '@lingui/react/macro'
import { RepositoryNotFound } from '#/features/repository/repository-route-state'
import { RepositoryUnavailableError } from '#/features/repository/repository-unavailable-error'
import {
  canonicalRepositoryHref,
  externalRepositoryId,
  rememberRepositoryIdentity,
} from '#/lib/repository-identity'
import { pageTitle } from '#/lib/page-title'
import { useEffect } from 'react'
import { useSuspenseQuery } from '@tanstack/react-query'

import { RepositoryShell } from '#/components/repository-shell'
import { RepositoryShellLoading } from '#/features/repository/repository-shell-loading'
import { trackRecentRepository } from '#/features/dashboard/recent-repositories'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '#/components/ui/empty'
import { getSignInUrl } from '#/lib/auth-redirect'
import { repositoryQueryOptions } from '#/client/queries/repository'
import { authenticationQueryOptions } from '#/client/queries/session'
import { checkConfirmedProfile } from '#/features/account/require-profile'

export const Route = createFileRoute('/github/$owner/$repo/$branch')({
  beforeLoad: async ({ context, location, params }) => {
    const redirectTo = location.href

    try {
      const [authenticationResult, repositoryResult] = await Promise.allSettled(
        [
          context.queryClient.ensureQueryData(authenticationQueryOptions()),
          context.queryClient.ensureQueryData(
            repositoryQueryOptions({
              owner: params.owner,
              repo: params.repo,
              branch: params.branch,
            }),
          ),
        ],
      )
      if (authenticationResult.status === 'rejected')
        throw authenticationResult.reason
      const authentication = authenticationResult.value
      checkConfirmedProfile(authentication, location.href)
      if (repositoryResult.status === 'rejected') throw repositoryResult.reason
      const repositoryData = repositoryResult.value

      rememberRepositoryIdentity(
        { ...repositoryData.repository, source: repositoryData.source },
        params,
      )
      context.queryClient.setQueryData(
        repositoryQueryOptions({
          ...params,
          owner: repositoryData.repository.owner,
          repo: repositoryData.repository.repo,
        }).queryKey,
        repositoryData,
      )
      const canonical = canonicalRepositoryHref(
        location.href,
        repositoryData.repository,
      )
      if (canonical !== location.href)
        throw redirect({ href: canonical, replace: true })

      if (repositoryData.branch && repositoryData.branch !== params.branch)
        throw redirect({
          href: `/github/${encodeURIComponent(params.owner)}/${encodeURIComponent(params.repo)}/${encodeURIComponent(repositoryData.branch)}`,
        })

      if (!authentication.user) {
        throw redirect({ href: getSignInUrl(redirectTo) })
      }
      return {
        repositoryIdentity: {
          repoId: externalRepositoryId(repositoryData.repository.id),
          source: repositoryData.source,
        },
      }
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'Authentication required'
      ) {
        throw redirect({
          href: getSignInUrl(redirectTo),
        })
      }
      throw error
    }
  },
  notFoundComponent: RepositoryNotFound,
  errorComponent: RepositoryUnavailableError,
  pendingMs: 120,
  pendingComponent: RepositoryShellLoading,
  component: RepositoryBranch,
  head: ({ params, matches, match }) =>
    match.status === 'notFound' || match._notFound
      ? pageTitle(
          translateMessage(
            matches[0].context.i18n,
            msg({ message: 'Page not found' }),
          ),
          params,
        )
      : pageTitle(
          translateMessage(
            matches[0].context.i18n,
            msg({ message: 'Repository' }),
          ),
          params,
        ),
})

function RepositoryBranch() {
  const params = Route.useParams()
  const redirectTo = useRouterState({
    select: (state) => state.location.href,
  })
  const { data: repositoryData } = useSuspenseQuery(
    repositoryQueryOptions(params),
  )
  const { data: authentication } = useSuspenseQuery(
    authenticationQueryOptions(),
  )
  useEffect(() => {
    if (
      !repositoryData.branchExists ||
      !repositoryData.branch ||
      !authentication.user
    )
      return
    trackRecentRepository(authentication.user.id, {
      repoId: externalRepositoryId(repositoryData.repository.id),
      source: repositoryData.source,
      owner: repositoryData.repository.owner,
      repo: repositoryData.repository.repo,
      branch: repositoryData.branch,
    })
  }, [repositoryData, authentication.user?.id])
  if (!repositoryData.branchExists) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4 md:p-6">
        <Empty className="max-w-xs p-0">
          <EmptyHeader>
            <EmptyTitle>
              <UiTrans>Branch not found</UiTrans>
            </EmptyTitle>
            <EmptyDescription>
              <UiTrans>This branch may have been removed or renamed.</UiTrans>
            </EmptyDescription>
          </EmptyHeader>
          <Button asChild size="sm" variant="outline">
            <Link
              to="/github/$owner/$repo"
              params={{ owner: params.owner, repo: params.repo }}
            >
              <UiTrans>Back to project</UiTrans>
            </Link>
          </Button>
        </Empty>
      </main>
    )
  }
  if (!authentication.user) {
    return <Navigate replace search={{ redirect: redirectTo }} to="/sign-in" />
  }
  return (
    <RepositoryShell
      owner={repositoryData.repository.owner}
      repo={repositoryData.repository.repo}
      branch={repositoryData.branch!}
      branches={repositoryData.branches}
      defaultBranch={repositoryData.repository.defaultBranch}
      configuration={repositoryData.configuration}
      discovery={repositoryData.discovery}
      runnableActions={repositoryData.runnableRepositoryActions}
      canViewGitHub={repositoryData.canViewGitHub}
      canPush={repositoryData.repository.canPush}
      isAdmin={authentication.isAdmin}
      user={authentication.user}
    >
      <Outlet />
    </RepositoryShell>
  )
}
