import {
  Trans as UiTrans,
  useLingui as useUiMessages,
} from '@lingui/react/macro'
import { useLingui } from '@lingui/react'
import { translateMessage } from '#/i18n/message'
import { repositoryPagePath } from '#/lib/repository-page-path'
import { HugeiconsIcon } from '@hugeicons/react'
import deployment from '#pagescms/deployment/client'
import {
  RepositoryPluginSidebar,
  RepositoryPluginBadge,
  RepositoryPluginNavigation,
} from '#/features/admin/plugin-page'
import { useRepositoryCoordinates } from '#/hooks/use-repository-coordinates'
import { ContentIcon } from '#/components/content-icon'
import { RepositoryHeaderNavigation } from '#/components/repository-page-header'
import { CreateBranchDialog } from '#/features/dashboard/create-branch-dialog'
import { Fragment, useState } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { repositoryBranchesQueryOptions } from '#/client/queries/repository'
import ArrowUpRight from '@hugeicons/core-free-icons/ArrowUpRight01Icon'
import Check from '@hugeicons/core-free-icons/CheckIcon'
import ChevronRight from '@hugeicons/core-free-icons/ChevronRightIcon'
import ChevronsUpDown from '@hugeicons/core-free-icons/UnfoldMoreIcon'
import FileText from '@hugeicons/core-free-icons/FileTextIcon'
import FileStack from '@hugeicons/core-free-icons/FileStackIcon'
import FolderOpen from '@hugeicons/core-free-icons/Folder02Icon'
import LayoutDashboard from '@hugeicons/core-free-icons/LayoutDashboardIcon'
import Database from '@hugeicons/core-free-icons/DatabaseIcon'
import Users from '@hugeicons/core-free-icons/UsersIcon'
import ListVideo from '@hugeicons/core-free-icons/ListVideoIcon'
import Settings from '@hugeicons/core-free-icons/Settings02Icon'

import { RepositoryActionButtons } from '#/components/repository-action-buttons'
import { Avatar, AvatarFallback, AvatarImage } from '#/components/ui/avatar'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '#/components/ui/collapsible'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
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
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarTrigger,
} from '#/components/ui/sidebar'
import { AccountMenu } from '#/features/account/account-menu'
import { AboutDialog } from '#/features/dashboard/about-dialog'
import { useSidebarScroll } from '#/hooks/use-sidebar-scroll'
import { cn } from 'cn'
import { readRecentRepositories } from '#/features/dashboard/recent-repositories'
import { BranchManager } from '#/features/dashboard/branch-manager'
import { compactBranches } from '#/features/dashboard/branch-picker'
import { getConfigurationNavigationGroups } from '#/shared/configuration-navigation'
import {
  isConfigurationEditingEnabled,
  isCacheManagementEnabled,
} from '#/shared/configuration-settings'
import { runnableRepositoryActions } from '#/lib/actions'
import { getConfigurationActionNames } from '#/shared/configuration-discovery'
import { repositoryIdentityKey } from '#/lib/repository-identity'

import type { ReactNode } from 'react'
import {
  RepositoryGitHubLinkContext,
  useRepositoryGitHubLink,
} from '#/hooks/use-repository-github-link'
import type { CurrentUser } from '#/lib/authentication'
import type { RecentRepository } from '#/features/dashboard/recent-repositories'
import type { ConfigurationNavigationNode } from '#/shared/configuration-navigation'
import type { AccessDiscoveryDecision } from '#/server/access/policy'
import type { RepositoryAction } from '#/lib/actions'

interface RepositoryShellProps {
  children: ReactNode
  owner: string
  repo: string
  branch: string
  branches: readonly string[]
  defaultBranch: string
  configuration: {
    object: Record<string, unknown>
  } | null
  discovery: AccessDiscoveryDecision
  runnableActions: readonly string[]
  canViewGitHub: boolean
  canPush: boolean
  isAdmin: boolean
  user: CurrentUser
}

export function RepositoryShell({
  children,
  owner,
  repo,
  branch,
  branches,
  defaultBranch,
  configuration,
  discovery,
  runnableActions,
  canViewGitHub,
  canPush,
  isAdmin,
  user,
}: RepositoryShellProps) {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const navigation = filterRepositoryNavigation(
    configuration
      ? getConfigurationNavigationGroups(configuration.object)
      : { content: [], media: [] },
    discovery,
  )
  const actions = configuration
    ? runnableRepositoryActions(
        configuration.object,
        'sidebar',
        runnableActions,
      )
    : []

  return (
    <RepositoryGitHubLinkContext value={canViewGitHub}>
      <SidebarProvider>
        <RepositorySidebar
          canManage={canViewGitHub && canPush}
          branch={branch}
          branches={branches}
          defaultBranch={defaultBranch}
          navigation={navigation}
          actions={actions}
          admin={{
            configuration:
              canViewGitHub &&
              isConfigurationEditingEnabled(configuration?.object ?? {}),
            collaborators: canViewGitHub,
            cache:
              Boolean(configuration) &&
              canViewGitHub &&
              canPush &&
              isCacheManagementEnabled(configuration?.object),
            actions:
              canViewGitHub &&
              Boolean(
                configuration &&
                getConfigurationActionNames(configuration.object).length,
              ) &&
              resourceTypeVisible(discovery, 'action'),
          }}
          owner={owner}
          pathname={pathname}
          repo={repo}
          isAdmin={isAdmin}
          user={user}
        />
        <SidebarInset className="min-h-screen">
          <RepositoryHeaderNavigation value={<SidebarTrigger />}>
            <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
          </RepositoryHeaderNavigation>
        </SidebarInset>
      </SidebarProvider>
    </RepositoryGitHubLinkContext>
  )
}

export function resourceTypeVisible(
  discovery: AccessDiscoveryDecision,
  type: 'collection' | 'media' | 'action',
) {
  if (discovery.visibility === 'all') return true
  if (discovery.visibility === 'none') return false
  return discovery.resources.some((resource) => resource.type === type)
}

export function filterRepositoryNavigation(
  navigation: ReturnType<typeof getConfigurationNavigationGroups>,
  discovery: AccessDiscoveryDecision,
) {
  if (discovery.visibility === 'all') return navigation
  const visible = new Set(
    discovery.visibility === 'filtered'
      ? discovery.resources.map(
          (resource) => `${resource.type}:${resource.name}`,
        )
      : [],
  )
  const filter = (
    nodes: readonly ConfigurationNavigationNode[],
  ): ConfigurationNavigationNode[] =>
    nodes.flatMap((node): ConfigurationNavigationNode[] => {
      if (node.type === 'group') {
        const items = filter(node.items)
        return items.length ? [{ ...node, items }] : []
      }
      const type = node.type === 'file' ? 'collection' : node.type
      return visible.has(`${type}:${node.name}`) ? [node] : []
    })
  return {
    content: filter(navigation.content),
    media: filter(navigation.media),
  }
}

function RepositorySidebar({
  canManage,
  actions,
  admin,
  isAdmin,
  branch,
  branches,
  defaultBranch,
  navigation,
  owner,
  pathname,
  repo,
  user,
}: {
  canManage: boolean
  actions: RepositoryAction[]
  isAdmin: boolean
  admin: Record<
    'configuration' | 'collaborators' | 'cache' | 'actions',
    boolean
  >
  branch: string
  branches: readonly string[]
  defaultBranch: string
  navigation: ReturnType<typeof getConfigurationNavigationGroups>
  owner: string
  pathname: string
  repo: string
  user: CurrentUser
}) {
  const { t: _t } = useUiMessages()

  const { i18n } = useLingui()
  const coordinates = useRepositoryCoordinates({ owner, repo, branch })
  const { ref, scrolled, showFooterBorder } = useSidebarScroll()

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader
        className={
          scrolled ? 'shadow-[inset_0_-1px_0_var(--sidebar-border)]' : undefined
        }
      >
        <SidebarMenu>
          <SidebarMenuItem>
            <RepositorySwitcher
              account={user.id}
              branch={branch}
              branches={branches}
              defaultBranch={defaultBranch}
              owner={owner}
              repo={repo}
            />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent ref={ref}>
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={
                  pathname ===
                    `/github/${owner}/${repo}/${encodeURIComponent(branch)}` ||
                  pathname ===
                    `/github/${owner}/${repo}/${encodeURIComponent(branch)}/`
                }
              >
                <Link
                  to="/github/$owner/$repo/$branch"
                  params={{ owner, repo, branch }}
                >
                  <HugeiconsIcon aria-hidden="true" icon={LayoutDashboard} />
                  <span>
                    <UiTrans>Overview</UiTrans>
                  </span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
        <NavigationGroup
          branch={branch}
          label={_t({ message: 'Content' })}
          nodes={navigation.content}
          owner={owner}
          pathname={pathname}
          repo={repo}
        />
        <NavigationGroup
          branch={branch}
          label={_t({ message: 'Media' })}
          nodes={navigation.media}
          owner={owner}
          pathname={pathname}
          repo={repo}
        />
        {actions.length && !admin.actions ? (
          <SidebarGroup>
            <SidebarGroupLabel>
              <UiTrans>Actions</UiTrans>
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <RepositoryActionButtons
                actions={actions}
                context={{
                  type: 'repository',
                  name: null,
                  path: null,
                  data: {},
                }}
                coordinates={coordinates}
                layout="sidebar"
              />
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}
        {Object.values(admin).some(Boolean) || canManage ? (
          <SidebarGroup>
            <SidebarGroupLabel>
              <UiTrans>Admin</UiTrans>
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {[
                  ...(
                    [
                      {
                        page: 'configuration',
                        order: 10,
                        label: _t({ message: 'Configuration' }),
                        icon: Settings,
                        to: '/github/$owner/$repo/$branch/configuration',
                      },
                      {
                        page: 'collaborators',
                        order: 30,
                        label: _t({ message: 'Collaborators' }),
                        icon: Users,
                        to: '/github/$owner/$repo/$branch/collaborators',
                      },
                      {
                        page: 'actions',
                        order: 20,
                        label: _t({ message: 'Actions' }),
                        icon: ListVideo,
                        to: '/github/$owner/$repo/$branch/actions',
                      },
                      {
                        page: 'cache',
                        order: 40,
                        label: _t({ message: 'Cache' }),
                        icon: Database,
                        to: '/github/$owner/$repo/$branch/cache',
                      },
                    ] as const
                  )
                    .filter((item) => admin[item.page])
                    .map((item) => ({
                      group: item.page === 'cache' ? 2 : 0,
                      order: item.order,
                      node: (
                        <SidebarMenuItem key={item.page}>
                          <SidebarMenuButton
                            asChild
                            isActive={
                              pathname ===
                              `/github/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(branch)}/${item.page}`
                            }
                          >
                            <Link to={item.to} params={{ owner, repo, branch }}>
                              <HugeiconsIcon
                                aria-hidden="true"
                                icon={item.icon}
                              />
                              <span>{item.label}</span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      ),
                    })),
                  ...(canManage
                    ? Object.entries(deployment.repositoryPages).map(
                        ([key, page]) => {
                          const path = repositoryPagePath(key, page)
                          return {
                            group: 1,
                            order: page.order ?? 100,
                            node: (
                              <RepositoryPluginNavigation
                                key={key}
                                pageKey={key}
                                {...coordinates}
                                accountId={user.id}
                              >
                                <SidebarMenuItem>
                                  <SidebarMenuButton
                                    asChild
                                    isActive={pathname.endsWith(`/${path}`)}
                                  >
                                    <Link
                                      to="/github/$owner/$repo/$branch/$page"
                                      params={{
                                        owner,
                                        repo,
                                        branch,
                                        page: path,
                                      }}
                                    >
                                      {page.icon ? (
                                        <page.icon />
                                      ) : (
                                        <HugeiconsIcon
                                          aria-hidden="true"
                                          icon={Settings}
                                        />
                                      )}
                                      <span>
                                        {translateMessage(i18n, page.label)}
                                      </span>
                                      <RepositoryPluginBadge
                                        pageKey={key}
                                        {...coordinates}
                                        accountId={user.id}
                                      />
                                    </Link>
                                  </SidebarMenuButton>
                                </SidebarMenuItem>
                              </RepositoryPluginNavigation>
                            ),
                          }
                        },
                      )
                    : []),
                ]
                  .sort((a, b) => a.group - b.group || a.order - b.order)
                  .map((item) => item.node)}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}
        {canManage ? (
          <RepositoryPluginSidebar {...coordinates} accountId={user.id} />
        ) : null}
      </SidebarContent>
      <SidebarFooter
        className={cn(
          'border-t border-transparent',
          showFooterBorder && 'border-sidebar-border',
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <AccountMenu isAdmin={isAdmin} user={user} align="start" side="top" />
          <AboutDialog />
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}

function RepositorySwitcher({
  account,
  branch,
  branches,
  defaultBranch,
  owner,
  repo,
}: {
  account: string
  branch: string
  branches: readonly string[]
  defaultBranch: string
  owner: string
  repo: string
}) {
  const { t: _t } = useUiMessages()

  const coordinates = useRepositoryCoordinates({ owner, repo, branch })
  const canViewGitHub = useRepositoryGitHubLink()
  const [manageOpen, setManageOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const [branchesOpen, setBranchesOpen] = useState(false)
  const branchQuery = useQuery({
    ...repositoryBranchesQueryOptions(coordinates),
    enabled: switcherOpen && branchesOpen,
  })
  const [recentRepositories, setRecentRepositories] = useState<
    RecentRepository[]
  >([])
  const displayedBranches = compactBranches(
    branchQuery.data ?? branches,
    branch,
    defaultBranch,
  )
  const closeSwitcher = () => {
    setSwitcherOpen(false)
    setBranchesOpen(false)
  }

  return (
    <>
      <DropdownMenu
        open={switcherOpen}
        onOpenChange={(open) => {
          setSwitcherOpen(open)
          if (!open) setBranchesOpen(false)
          if (!open) return
          setRecentRepositories(
            readRecentRepositories(account)
              .filter(
                (project) =>
                  project.owner.toLowerCase() !== owner.toLowerCase() ||
                  project.repo.toLowerCase() !== repo.toLowerCase(),
              )
              .slice(0, 3),
          )
        }}
      >
        <DropdownMenuTrigger asChild>
          <SidebarMenuButton
            className="data-[state=open]:bg-sidebar-accent"
            size="lg"
          >
            <Avatar className="size-8 rounded-md">
              <AvatarImage
                alt={_t({ message: `${owner}'s avatar` })}
                src={`https://github.com/${encodeURIComponent(owner)}.png?size=64`}
              />
              <AvatarFallback>{owner.slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{repo}</span>
              <span className="truncate text-xs text-muted-foreground">
                {branch}
              </span>
            </div>
            <HugeiconsIcon
              aria-hidden="true"
              icon={ChevronsUpDown}
              className="ml-auto text-muted-foreground"
            />
          </SidebarMenuButton>
        </DropdownMenuTrigger>
        {/* Don't retain the exit-animation portal across pending navigation. */}
        {switcherOpen ? (
          <DropdownMenuContent
            align="start"
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56"
          >
            {canViewGitHub ? (
              <>
                <DropdownMenuItem asChild>
                  <a
                    href={`https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/tree/${encodeURIComponent(branch)}`}
                    rel="noreferrer noopener"
                    target="_blank"
                  >
                    <UiTrans>View on GitHub</UiTrans>
                    <HugeiconsIcon
                      aria-hidden="true"
                      icon={ArrowUpRight}
                      className="ml-auto opacity-50"
                    />
                  </a>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            ) : null}
            <DropdownMenuSub open={branchesOpen} onOpenChange={setBranchesOpen}>
              <DropdownMenuSubTrigger>
                <span className="truncate">
                  <UiTrans>Branch: </UiTrans>
                  {branch}
                </span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="min-w-56 max-w-80">
                {branchQuery.isError ? (
                  <DropdownMenuItem disabled>
                    <UiTrans>Could not load branches.</UiTrans>
                  </DropdownMenuItem>
                ) : null}
                {displayedBranches.map((value) => (
                  <DropdownMenuItem
                    key={value}
                    asChild
                    onSelect={closeSwitcher}
                  >
                    <Link
                      to="/github/$owner/$repo/$branch"
                      params={{ owner, repo, branch: value }}
                      onClick={closeSwitcher}
                    >
                      <span className="truncate">{value}</span>
                      {value === branch ? (
                        <HugeiconsIcon
                          aria-hidden="true"
                          icon={Check}
                          className="ml-auto"
                        />
                      ) : null}
                    </Link>
                  </DropdownMenuItem>
                ))}
                {branchQuery.isPending ? (
                  <div
                    role="status"
                    aria-label={_t({ message: 'Loading branches' })}
                    className="px-2 py-1.5 text-sm text-muted-foreground"
                  >
                    <UiTrans>Loading branches…</UiTrans>
                  </div>
                ) : null}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => {
                    closeSwitcher()
                    setManageOpen(true)
                  }}
                >
                  <UiTrans>All branches…</UiTrans>
                </DropdownMenuItem>
                {canViewGitHub ? (
                  <DropdownMenuItem
                    onSelect={() => {
                      closeSwitcher()
                      setCreateOpen(true)
                    }}
                  >
                    <UiTrans>Create branch…</UiTrans>
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            {recentRepositories.length ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>
                  <UiTrans>Recently visited</UiTrans>
                </DropdownMenuLabel>
                {recentRepositories.map((project) => (
                  <DropdownMenuItem
                    asChild
                    onSelect={closeSwitcher}
                    key={repositoryIdentityKey(project)}
                  >
                    <Link
                      params={project}
                      to="/github/$owner/$repo/$branch"
                      onClick={closeSwitcher}
                    >
                      <img
                        alt={_t({ message: `${project.owner}'s avatar` })}
                        className="size-5 rounded"
                        src={`https://github.com/${encodeURIComponent(project.owner)}.png?size=40`}
                      />
                      <span className="truncate">{project.repo}</span>
                    </Link>
                  </DropdownMenuItem>
                ))}
              </>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild onSelect={closeSwitcher}>
              <Link to="/" onClick={closeSwitcher}>
                <UiTrans>All projects</UiTrans>
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        ) : null}
      </DropdownMenu>
      <BranchManager
        open={manageOpen}
        onOpenChange={setManageOpen}
        {...coordinates}
      />
      <CreateBranchDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        {...coordinates}
      />
    </>
  )
}

function NavigationGroup({
  branch,
  label,
  nodes,
  owner,
  pathname,
  repo,
}: {
  branch: string
  label: string
  nodes: readonly ConfigurationNavigationNode[]
  owner: string
  pathname: string
  repo: string
}) {
  if (!nodes.length) return null
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {nodes.map((node) => (
            <Fragment key={`${label}:${node.name}`}>
              <NavigationNode
                branch={branch}
                node={node}
                owner={owner}
                pathname={pathname}
                repo={repo}
              />
            </Fragment>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

function NavigationNode({
  branch,
  nested = false,
  node,
  owner,
  pathname,
  repo,
}: {
  branch: string
  nested?: boolean
  node: ConfigurationNavigationNode
  owner: string
  pathname: string
  repo: string
}) {
  if (node.type === 'group') {
    const active = node.items.some((item) =>
      hasActiveNode(item, pathname, owner, repo, branch),
    )
    const children = (
      <>
        <CollapsibleTrigger asChild>
          {nested ? (
            <SidebarMenuSubButton className="data-[state=open]:[&>svg]:rotate-90">
              <HugeiconsIcon
                aria-hidden="true"
                icon={ChevronRight}
                className="transition-transform"
              />
              <span>
                {'defaultLabel' in node && node.defaultLabel === 'media' ? (
                  <UiTrans>Media</UiTrans>
                ) : (
                  node.label
                )}
              </span>
            </SidebarMenuSubButton>
          ) : (
            <SidebarMenuButton className="data-[state=open]:[&>svg]:rotate-90">
              <HugeiconsIcon
                aria-hidden="true"
                icon={ChevronRight}
                className="transition-transform"
              />
              <span>
                {'defaultLabel' in node && node.defaultLabel === 'media' ? (
                  <UiTrans>Media</UiTrans>
                ) : (
                  node.label
                )}
              </span>
            </SidebarMenuButton>
          )}
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            {node.items.map((item) => (
              <NavigationNode
                branch={branch}
                key={`${node.name}:${item.name}`}
                nested
                node={item}
                owner={owner}
                pathname={pathname}
                repo={repo}
              />
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </>
    )
    return (
      <Collapsible defaultOpen={active} asChild>
        {nested ? (
          <SidebarMenuSubItem>{children}</SidebarMenuSubItem>
        ) : (
          <SidebarMenuItem>{children}</SidebarMenuItem>
        )}
      </Collapsible>
    )
  }

  const href = navigationPath(owner, repo, branch, node.type, node.name)
  const content = (
    <Link
      params={{ owner, repo, branch, name: node.name }}
      to={
        node.type === 'collection'
          ? '/github/$owner/$repo/$branch/collection/$name'
          : node.type === 'file'
            ? '/github/$owner/$repo/$branch/file/$name'
            : '/github/$owner/$repo/$branch/media/$name'
      }
    >
      <ContentIcon
        name={node.icon}
        fallback={
          node.type === 'collection'
            ? FileStack
            : node.type === 'file'
              ? FileText
              : FolderOpen
        }
      />
      <span>
        {'defaultLabel' in node && node.defaultLabel === 'media' ? (
          <UiTrans>Media</UiTrans>
        ) : (
          node.label
        )}
      </span>
    </Link>
  )

  return nested ? (
    <SidebarMenuSubItem>
      <SidebarMenuSubButton asChild isActive={isActivePath(pathname, href)}>
        {content}
      </SidebarMenuSubButton>
    </SidebarMenuSubItem>
  ) : (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isActivePath(pathname, href)}>
        {content}
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

function hasActiveNode(
  node: ConfigurationNavigationNode,
  pathname: string,
  owner: string,
  repo: string,
  branch: string,
): boolean {
  if (node.type === 'group') {
    return node.items.some((item) =>
      hasActiveNode(item, pathname, owner, repo, branch),
    )
  }
  return isActivePath(
    pathname,
    navigationPath(owner, repo, branch, node.type, node.name),
  )
}

function repositoryPath(
  owner: string,
  repo: string,
  branch: string,
  suffix: string,
) {
  return `/github/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(branch)}/${suffix}`
}

function navigationPath(
  owner: string,
  repo: string,
  branch: string,
  type: 'collection' | 'file' | 'media',
  name: string,
) {
  return `${repositoryPath(owner, repo, branch, type)}/${encodeURIComponent(name)}`
}

function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`)
}
