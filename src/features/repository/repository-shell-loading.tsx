import { useLingui as useUiMessages } from '@lingui/react/macro'
import { useLingui } from '@lingui/react'
import { translateMessage } from '#/i18n/message'
import { useQueryClient } from '@tanstack/react-query'
import { authenticationQueryOptions } from '#/client/queries/session'
import deployment from '#pagescms/deployment/client'
import { repositoryPageKey } from '#/lib/repository-page-path'
import {
  RepositoryAdminPage,
  RepositoryAdminHeaderActions,
} from '#/features/admin/repository-admin-page'
import { CollaboratorsSkeleton } from '#/features/admin/collaborators-skeleton'
import { ActionsSkeleton } from '#/features/admin/actions-skeleton'
import { ConfigurationSkeleton } from '#/features/admin/configuration-skeleton'
import { CacheSkeleton } from '#/features/admin/cache-skeleton'
import { ContentEntrySkeleton } from '#/components/content-entry-skeleton'
import { SettingsLoading } from '#/components/settings-loading'
import { useLocation } from '@tanstack/react-router'
import {
  RepositoryHeaderNavigation,
  RepositoryPageHeader,
} from '#/components/repository-page-header'
import { CollectionSkeleton } from '#/features/collections/collection-skeleton'
import { OverviewSkeleton } from '#/features/repository/overview-loading'
import { AboutDialog } from '#/features/dashboard/about-dialog'
import { repositoryPendingContent } from '#/features/repository/repository-loading'
import { useSidebarScroll } from '#/hooks/use-sidebar-scroll'
import { cn } from 'cn'
import { Skeleton } from '#/components/ui/skeleton'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '#/components/ui/sidebar'

export function RepositoryShellLoading() {
  const { t: _t } = useUiMessages()

  const { pathname } = useLocation()
  const content = repositoryPendingContent(pathname)

  const { ref, scrolled, showFooterBorder } = useSidebarScroll()

  return (
    <SidebarProvider aria-label={_t({ message: 'Loading repository' })}>
      <Sidebar collapsible="offcanvas">
        <SidebarHeader
          className={
            scrolled
              ? 'shadow-[inset_0_-1px_0_var(--sidebar-border)]'
              : undefined
          }
        >
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                aria-hidden
                className="disabled:opacity-100"
                disabled
                size="lg"
              >
                <Skeleton className="size-8 shrink-0 rounded-md" />
                <span className="grid min-w-0 flex-1 gap-1.5">
                  <Skeleton className="h-3.5 w-28" />
                  <Skeleton className="h-3 w-16" />
                </span>
                <Skeleton className="ml-auto size-4 shrink-0 rounded-sm" />
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent ref={ref}>
          <RepositoryShellLoadingGroup rows={1} />
          <RepositoryShellLoadingGroup heading rows={3} />
          <RepositoryShellLoadingGroup heading rows={3} />
        </SidebarContent>
        <SidebarFooter
          className={cn(
            'border-t border-transparent',
            showFooterBorder && 'border-sidebar-border',
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex size-7 items-center justify-center">
              <Skeleton className="size-6 rounded-full" />
            </div>
            <AboutDialog />
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="min-h-screen">
        <RepositoryHeaderNavigation value={<SidebarTrigger disabled />}>
          <main className="min-w-0 flex-1 p-4 md:p-6">
            {content === 'overview' ? (
              <OverviewSkeleton />
            ) : content === 'collection' ? (
              <CollectionSkeleton />
            ) : (
              <RepositoryContentSkeleton pathname={pathname} />
            )}
          </main>
        </RepositoryHeaderNavigation>
      </SidebarInset>
    </SidebarProvider>
  )
}

function RepositoryContentSkeleton({ pathname }: { pathname: string }) {
  const { t: _t } = useUiMessages()

  const { i18n } = useLingui()
  const queryClient = useQueryClient()
  const accountId = queryClient.getQueryData(
    authenticationQueryOptions().queryKey,
  )?.user?.id
  const [, owner, repo, branch, section] = pathname
    .split('/')
    .filter(Boolean)
    .map(decodeURIComponent)
  const pageKey = repositoryPageKey(deployment.repositoryPages, section)
  const page = pageKey ? deployment.repositoryPages[pageKey] : undefined
  if (page?.loading) {
    const Loading = page.loading
    return (
      <RepositoryAdminPage title={translateMessage(i18n, page.label)}>
        <Loading
          owner={owner}
          repo={repo}
          branch={branch}
          accountId={accountId}
          HeaderActions={RepositoryAdminHeaderActions}
        />
      </RepositoryAdminPage>
    )
  }
  if (section === 'collaborators') return <CollaboratorsSkeleton />
  if (section === 'actions') return <ActionsSkeleton />
  if (section === 'configuration') return <ConfigurationSkeleton />
  if (section === 'cache') return <CacheSkeleton />
  if (section === 'media')
    return (
      <div className="-m-4 md:-m-6">
        <RepositoryPageHeader
          toolbar={<Skeleton className="h-8 w-64 max-w-full" />}
          actions={<Skeleton className="h-8 w-28" />}
        >
          <Skeleton className="h-5 w-40" />
        </RepositoryPageHeader>
        <div className="p-4 md:p-6">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((item) => (
              <div key={item} className="space-y-2">
                <Skeleton className="aspect-video w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  if (section === 'file' || section === 'collection')
    return <ContentEntrySkeleton />
  return (
    <div
      className="-mt-4 md:-mt-6"
      aria-label={_t({ message: 'Loading page' })}
    >
      <RepositoryPageHeader className="-mx-4 md:-mx-6">
        <Skeleton className="h-6 w-40" />
      </RepositoryPageHeader>
      <div className="mx-auto max-w-5xl py-6">
        <SettingsLoading />
      </div>
    </div>
  )
}

function RepositoryShellLoadingGroup({
  heading = false,
  rows,
}: {
  heading?: boolean
  rows: number
}) {
  return (
    <SidebarGroup>
      {heading && (
        <SidebarGroupLabel>
          <Skeleton className="h-3 w-16" />
        </SidebarGroupLabel>
      )}
      <SidebarGroupContent>
        <SidebarMenu>
          {Array.from({ length: rows }, (_, index) => (
            <SidebarMenuItem key={index}>
              <SidebarMenuButton
                aria-hidden
                className="disabled:opacity-100"
                disabled
              >
                <Skeleton
                  className={
                    index === 0
                      ? 'h-3.5 w-20'
                      : index === 1
                        ? 'h-3.5 w-24'
                        : 'h-3.5 w-28'
                  }
                />
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
