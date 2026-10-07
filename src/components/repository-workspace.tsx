import { Fragment, useState } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { repositoryBranchesQueryOptions } from '#/queries/repository'
import {
  ArrowUpRight,
  ArrowLeft,
  Check,
  ChevronRight,
  ChevronsUpDown,
  File,
  FileStack,
  FolderOpen,
  GitBranch,
  LoaderCircle,
  Settings,
} from 'lucide-react'

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
import { AccountMenu } from '#/features/account/app-header'
import { AboutDialog } from '#/features/projects/about-dialog'
import { readRecentProjects } from '#/features/projects/recent-projects'
import { BranchManager } from '#/features/projects/branch-manager'
import { compactBranches } from '#/features/projects/branch-picker'
import { getConfigurationNavigationGroups } from '#/lib/configuration-navigation'
import { repositoryActions } from '#/lib/actions'

import type { ReactNode } from 'react'
import {
  RepositoryGitHubLinkContext,
  useRepositoryGitHubLink,
} from '#/hooks/use-repository-github-link'
import type { AppHeaderUser } from '#/features/account/app-header'
import type { RecentProject } from '#/features/projects/recent-projects'
import type { ConfigurationNavigationNode } from '#/lib/configuration-navigation'
import type { AccessDiscoveryDecision } from '#/server/access-policy.server'
import type { RepositoryAction } from '#/lib/actions'

interface WorkspaceProps {
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
  canViewGitHub: boolean
  user: AppHeaderUser
}

export function RepositoryWorkspace({
  children,
  owner,
  repo,
  branch,
  branches,
  defaultBranch,
  configuration,
  discovery,
  canViewGitHub,
  user,
}: WorkspaceProps) {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const navigation = filterRepositoryNavigation(
    configuration
      ? getConfigurationNavigationGroups(configuration.object)
      : { content: [], media: [] },
    discovery,
  )
  const actions = filterRepositoryActions(
    configuration ? repositoryActions(configuration.object) : [],
    discovery,
  )

  return (
    <RepositoryGitHubLinkContext value={canViewGitHub}>
      <SidebarProvider>
        <RepositorySidebar
          branch={branch}
          branches={branches}
          defaultBranch={defaultBranch}
          navigation={navigation}
          actions={actions}
          owner={owner}
          pathname={pathname}
          repo={repo}
          user={user}
        />
        <SidebarInset className="min-h-screen">
          <header className="sticky top-0 z-30 flex h-12 items-center border-b bg-background px-3 md:hidden">
            <SidebarTrigger />
          </header>
          <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
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
      if (node.type === 'file') return [node]
      return visible.has(`${node.type}:${node.name}`) ? [node] : []
    })
  return {
    content: filter(navigation.content),
    media: filter(navigation.media),
  }
}

export function filterRepositoryActions(
  actions: readonly RepositoryAction[],
  discovery: AccessDiscoveryDecision,
) {
  if (discovery.visibility === 'all') return [...actions]
  if (discovery.visibility === 'none') return []
  const visible = new Set(
    discovery.resources
      .filter((resource) => resource.type === 'action')
      .map((resource) => resource.name),
  )
  return actions.filter((action) => visible.has(action.name))
}

function RepositorySidebar({
  actions,
  branch,
  branches,
  defaultBranch,
  navigation,
  owner,
  pathname,
  repo,
  user,
}: {
  actions: RepositoryAction[]
  branch: string
  branches: readonly string[]
  defaultBranch: string
  navigation: ReturnType<typeof getConfigurationNavigationGroups>
  owner: string
  pathname: string
  repo: string
  user: AppHeaderUser
}) {
  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <RepositorySwitcher
              branch={branch}
              branches={branches}
              defaultBranch={defaultBranch}
              owner={owner}
              repo={repo}
            />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavigationGroup
          branch={branch}
          label="Content"
          nodes={navigation.content}
          owner={owner}
          pathname={pathname}
          repo={repo}
        />
        <NavigationGroup
          branch={branch}
          label="Media"
          nodes={navigation.media}
          owner={owner}
          pathname={pathname}
          repo={repo}
        />
        {actions.length ? (
          <SidebarGroup>
            <SidebarGroupLabel>Actions</SidebarGroupLabel>
            <SidebarGroupContent>
              <RepositoryActionButtons
                actions={actions}
                context={{
                  type: 'repository',
                  name: null,
                  path: null,
                  data: {},
                }}
                coordinates={{ owner, repo, branch }}
                layout="sidebar"
              />
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}
      </SidebarContent>
      <SidebarFooter className="border-t">
        <div className="flex items-center justify-between gap-2">
          <AccountMenu user={user} />
          <AboutDialog />
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}

function RepositorySwitcher({
  branch,
  branches,
  defaultBranch,
  owner,
  repo,
}: {
  branch: string
  branches: readonly string[]
  defaultBranch: string
  owner: string
  repo: string
}) {
  const canViewGitHub = useRepositoryGitHubLink()
  const [manageOpen, setManageOpen] = useState(false)
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const branchQuery = useQuery({
    ...repositoryBranchesQueryOptions({ owner, repo, branch }),
    enabled: switcherOpen,
  })
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([])
  const displayedBranches = compactBranches(
    branchQuery.data ?? branches,
    branch,
    defaultBranch,
  )
  const closeSwitcher = () => setSwitcherOpen(false)

  return (
    <>
      <DropdownMenu
        open={switcherOpen}
        onOpenChange={(open) => {
          setSwitcherOpen(open)
          if (!open) return
          setRecentProjects(
            readRecentProjects()
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
                alt={`${owner}'s avatar`}
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
            <ChevronsUpDown className="ml-auto" />
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
                    View on GitHub
                    <ArrowUpRight className="ml-auto opacity-50" />
                  </a>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild onSelect={closeSwitcher}>
                  <Link
                    to="/$owner/$repo/$branch/settings"
                    params={{ owner, repo, branch }}
                    onClick={closeSwitcher}
                  >
                    <Settings />
                    Settings
                  </Link>
                </DropdownMenuItem>
              </>
            ) : null}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <GitBranch />
                <span className="truncate">{branch}</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="min-w-56 max-w-80">
                {branchQuery.isLoading ? (
                  <DropdownMenuItem disabled>
                    <LoaderCircle className="animate-spin" />
                    Loading branches…
                  </DropdownMenuItem>
                ) : null}
                {branchQuery.isError ? (
                  <DropdownMenuItem disabled>
                    Could not load branches.
                  </DropdownMenuItem>
                ) : null}
                {displayedBranches.map((value) => (
                  <DropdownMenuItem
                    key={value}
                    asChild
                    onSelect={closeSwitcher}
                  >
                    <Link
                      to="/$owner/$repo/$branch"
                      params={{ owner, repo, branch: value }}
                      onClick={closeSwitcher}
                    >
                      <span className="truncate">{value}</span>
                      {value === branch ? <Check className="ml-auto" /> : null}
                    </Link>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => {
                    closeSwitcher()
                    setManageOpen(true)
                  }}
                >
                  Manage branches
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            {recentProjects.length ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Recently visited</DropdownMenuLabel>
                {recentProjects.map((project) => (
                  <DropdownMenuItem
                    asChild
                    onSelect={closeSwitcher}
                    key={`${project.owner}/${project.repo}`}
                  >
                    <Link
                      params={project}
                      to="/$owner/$repo/$branch"
                      onClick={closeSwitcher}
                    >
                      <img
                        alt={`${project.owner}'s avatar`}
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
                <ArrowLeft />
                All projects
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        ) : null}
      </DropdownMenu>
      <BranchManager
        open={manageOpen}
        onOpenChange={setManageOpen}
        owner={owner}
        repo={repo}
        branch={branch}
        canCreate={canViewGitHub}
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
            <SidebarMenuSubButton>
              <ChevronRight className="transition-transform group-data-[state=open]/navigation:rotate-90" />
              <span>{node.label}</span>
            </SidebarMenuSubButton>
          ) : (
            <SidebarMenuButton>
              <ChevronRight className="transition-transform group-data-[state=open]/navigation:rotate-90" />
              <span>{node.label}</span>
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
      <Collapsible className="group/navigation" defaultOpen={active} asChild>
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
          ? '/$owner/$repo/$branch/collection/$name'
          : node.type === 'file'
            ? '/$owner/$repo/$branch/file/$name'
            : '/$owner/$repo/$branch/media/$name'
      }
    >
      {node.type === 'collection' ? (
        <FileStack />
      ) : node.type === 'file' ? (
        <File />
      ) : (
        <FolderOpen />
      )}
      <span>{node.label}</span>
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
  return `/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(branch)}/${suffix}`
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
