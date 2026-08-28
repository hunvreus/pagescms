import { useEffect } from 'react'
import {
  Navigate,
  Outlet,
  createFileRoute,
  redirect,
  useRouterState,
} from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'

import { RepositoryWorkspace } from '#/components/repository-workspace'
import { RepositoryPageHeader } from '#/components/repository-page-header'
import { CollectionSkeleton } from '#/features/collections/collection-skeleton'
import { trackRecentProject } from '#/features/projects/recent-projects'
import { repositoryPendingContent } from '#/features/repository/repository-loading'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '#/components/ui/empty'
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
} from '#/components/ui/sidebar'
import { Skeleton } from '#/components/ui/skeleton'
import { getSignInUrl } from '#/lib/auth-redirect'
import { repositoryWorkspaceQueryOptions } from '#/queries/repository'
import { authenticationQueryOptions } from '#/queries/session'

export const Route = createFileRoute('/$owner/$repo/$branch')({
  loader: async ({ context, location, params }) => {
    const redirectTo = location.href

    try {
      const [, authentication] = await Promise.all([
        context.queryClient.ensureQueryData(
          repositoryWorkspaceQueryOptions({
            owner: params.owner,
            repo: params.repo,
            branch: params.branch,
          }),
        ),
        context.queryClient.ensureQueryData(authenticationQueryOptions()),
      ])

      if (!authentication.user) {
        throw redirect({ href: getSignInUrl(redirectTo) })
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
  pendingMs: 120,
  pendingComponent: WorkspaceLoading,
  component: BranchWorkspace,
})

function BranchWorkspace() {
  const params = Route.useParams()
  const redirectTo = useRouterState({
    select: (state) => state.location.href,
  })
  const { data: workspace } = useSuspenseQuery(
    repositoryWorkspaceQueryOptions(params),
  )
  const { data: authentication } = useSuspenseQuery(
    authenticationQueryOptions(),
  )
  useEffect(() => {
    if (!workspace.branchExists || !workspace.branch) return
    trackRecentProject({
      owner: workspace.repository.owner,
      repo: workspace.repository.repo,
      branch: workspace.branch,
    })
  }, [workspace])
  if (!workspace.branchExists) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4 md:p-6">
        <Empty className="max-w-xs p-0">
          <EmptyHeader>
            <EmptyTitle>Branch not found</EmptyTitle>
            <EmptyDescription>
              This branch may have been removed or renamed.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </main>
    )
  }
  if (!authentication.user) {
    return <Navigate replace search={{ redirect: redirectTo }} to="/sign-in" />
  }
  return (
    <RepositoryWorkspace
      owner={workspace.repository.owner}
      repo={workspace.repository.repo}
      branch={workspace.branch!}
      branches={workspace.branches}
      configuration={workspace.configuration}
      discovery={workspace.discovery}
      user={authentication.user}
    >
      <Outlet />
    </RepositoryWorkspace>
  )
}

function WorkspaceLoading() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })

  return (
    <SidebarProvider aria-label="Loading repository">
      <Sidebar collapsible="offcanvas">
        <SidebarHeader>
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
        <SidebarContent>
          <WorkspaceLoadingGroup label="Content" rows={1} />
          <WorkspaceLoadingGroup label="Media" rows={1} />
          <WorkspaceLoadingGroup label="Admin" rows={3} />
        </SidebarContent>
        <SidebarFooter className="border-t">
          <div className="flex items-center justify-between gap-2">
            <Skeleton className="size-8 rounded-full" />
            <Skeleton className="size-8 rounded-md" />
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="min-h-screen">
        <header className="sticky top-0 z-30 flex h-12 items-center border-b bg-background px-3 md:hidden">
          <Skeleton className="size-8 rounded-md" />
        </header>
        <main className="min-w-0 flex-1 p-4 md:p-6">
          {repositoryPendingContent(pathname) === 'collection' ? (
            <CollectionSkeleton />
          ) : (
            <RepositoryContentSkeleton />
          )}
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}

function RepositoryContentSkeleton() {
  return (
    <div className="-mt-4 md:-mt-6" aria-label="Loading page">
      <RepositoryPageHeader className="-mx-4 md:-mx-6">
        <Skeleton className="h-6 w-40" />
      </RepositoryPageHeader>
    </div>
  )
}

function WorkspaceLoadingGroup({
  label,
  rows,
}: {
  label: string
  rows: number
}) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {Array.from({ length: rows }, (_, index) => (
            <SidebarMenuItem key={index}>
              <SidebarMenuButton
                aria-hidden
                className="disabled:opacity-100"
                disabled
              >
                <Skeleton className="size-4 shrink-0 rounded-sm" />
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
