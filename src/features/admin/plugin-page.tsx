import { DocumentTitle } from '#/i18n/document-title'
import { useLingui } from '@lingui/react'
import { translateMessage } from '#/i18n/message'
import { repositoryPageKey } from '#/lib/repository-page-path'
import { componentLoader } from '#/lib/component-loader'
import { deferredComponent } from '#/lib/deferred-component'
import type { ReactNode } from 'react'
import { lazy, Suspense } from 'react'
import { useSuspenseQuery } from '@tanstack/react-query'
import deployment from '#pagescms/deployment/client'
import { authenticationQueryOptions } from '#/client/queries/session'
import { SettingsLoading } from '#/components/settings-loading'
import {
  RepositoryAdminPage,
  RepositoryAdminHeaderActions,
} from './repository-admin-page'
import type { RepositoryPageProps } from '#/plugins/client'

const pages = new Map(
  Object.entries(deployment.repositoryPages).map(([key, page]) => {
    const load = componentLoader(page.load)
    return [
      key,
      {
        ...page,
        load,
        Component: lazy(load),
        Navigation: page.navigation
          ? deferredComponent(page.navigation, (props) => props.children)
          : null,
        Badge: page.badge ? deferredComponent(page.badge) : null,
      },
    ] as const
  }),
)
export async function preloadRepositoryPluginPage(path: string) {
  const key = repositoryPageKey(deployment.repositoryPages, path)
  if (key) await pages.get(key)?.load()
}

const SidebarContribution = deployment.ui.repositorySidebar
  ? deferredComponent(deployment.ui.repositorySidebar)
  : null

export function RepositoryPluginNavigation({
  pageKey,
  children,
  ...props
}: RepositoryPageProps & { pageKey: string; children: ReactNode }) {
  const Navigation = pages.get(pageKey)?.Navigation
  return Navigation ? (
    <Suspense fallback={children}>
      <Navigation {...props}>{children}</Navigation>
    </Suspense>
  ) : (
    children
  )
}

export function RepositoryPluginBadge({
  pageKey,
  ...props
}: RepositoryPageProps & { pageKey: string }) {
  const Badge = pages.get(pageKey)?.Badge
  return Badge ? (
    <Suspense fallback={null}>
      <Badge {...props} />
    </Suspense>
  ) : null
}

export function RepositoryPluginSidebar(props: RepositoryPageProps) {
  return SidebarContribution ? (
    <Suspense fallback={null}>
      <SidebarContribution
        key={`${props.accountId}:${props.owner}/${props.repo}/${props.branch}`}
        {...props}
      />
    </Suspense>
  ) : null
}

export function RepositoryPluginPage({
  page,
  ...props
}: Omit<RepositoryPageProps, 'accountId'> & { page: string }) {
  const { i18n } = useLingui()
  const { data } = useSuspenseQuery(authenticationQueryOptions())
  const key = repositoryPageKey(deployment.repositoryPages, page)
  const contribution = key ? pages.get(key) : undefined
  if (!contribution || !data.user) return null
  const Loading = contribution.loading
  const fallback = Loading ? (
    <Loading
      {...props}
      accountId={data.user.id}
      HeaderActions={RepositoryAdminHeaderActions}
    />
  ) : (
    <SettingsLoading />
  )
  return (
    <RepositoryAdminPage title={translateMessage(i18n, contribution.label)}>
      <DocumentTitle message={contribution.label} repository={props} />
      <Suspense fallback={fallback}>
        <contribution.Component
          key={`${data.user.id}:${props.owner}/${props.repo}/${props.branch}`}
          {...props}
          accountId={data.user.id}
          HeaderActions={RepositoryAdminHeaderActions}
        />
      </Suspense>
    </RepositoryAdminPage>
  )
}
