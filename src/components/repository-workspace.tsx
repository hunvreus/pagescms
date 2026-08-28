import { Fragment, useMemo, useState } from 'react'
import { Link, useRouter, useRouterState } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import {
  ArrowUpRight,
  ChevronRight,
  ChevronsUpDown,
  Database,
  File,
  FileStack,
  FolderOpen,
  ListVideo,
  LoaderCircle,
  Plus,
  Settings,
  Users,
} from 'lucide-react'

import { OperationError } from '#/components/operation-error'
import { Avatar, AvatarFallback, AvatarImage } from '#/components/ui/avatar'
import { Button } from '#/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '#/components/ui/collapsible'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { Field, FieldLabel } from '#/components/ui/field'
import { Input } from '#/components/ui/input'
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
import { createRepositoryBranch } from '#/functions/repository'
import {
  isCacheEnabled,
  isConfigurationEditingEnabled,
} from '#/lib/configuration'
import { getConfigurationNavigationGroups } from '#/lib/configuration-navigation'
import { queryKeys } from '#/queries/keys'

import type { ReactNode } from 'react'
import type { AppHeaderUser } from '#/features/account/app-header'
import type { RecentProject } from '#/features/projects/recent-projects'
import type { ConfigurationNavigationNode } from '#/lib/configuration-navigation'
import type { AccessDiscoveryDecision } from '#/server/access-policy.server'

interface WorkspaceProps {
  children: ReactNode
  owner: string
  repo: string
  branch: string
  branches: readonly string[]
  configuration: {
    object: Record<string, unknown>
  } | null
  discovery: AccessDiscoveryDecision
  user: AppHeaderUser
}

export function RepositoryWorkspace({
  children,
  owner,
  repo,
  branch,
  branches,
  configuration,
  discovery,
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
  const canManageRepository = Boolean(user.githubUsername)
  const adminItems = configuration
    ? [
        ...(canManageRepository && isCacheEnabled(configuration.object)
          ? [{ key: 'cache', label: 'Cache', icon: <Database /> }]
          : []),
        ...(canManageRepository && resourceTypeVisible(discovery, 'action')
          ? [{ key: 'actions', label: 'Actions', icon: <ListVideo /> }]
          : []),
        ...(canManageRepository
          ? [
              {
                key: 'collaborators',
                label: 'Collaborators',
                icon: <Users />,
              },
            ]
          : []),
        ...(canManageRepository &&
        isConfigurationEditingEnabled(configuration.object)
          ? [
              {
                key: 'configuration',
                label: 'Configuration',
                icon: <Settings />,
              },
            ]
          : []),
      ]
    : []

  return (
    <SidebarProvider>
      <RepositorySidebar
        adminItems={adminItems}
        branch={branch}
        branches={branches}
        navigation={navigation}
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
  )
}

function resourceTypeVisible(
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

function RepositorySidebar({
  adminItems,
  branch,
  branches,
  navigation,
  owner,
  pathname,
  repo,
  user,
}: {
  adminItems: Array<{ key: string; label: string; icon: ReactNode }>
  branch: string
  branches: readonly string[]
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
        {adminItems.length ? (
          <SidebarGroup>
            <SidebarGroupLabel>Admin</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminItems.map((item) => {
                  const href = repositoryPath(owner, repo, branch, item.key)
                  return (
                    <SidebarMenuItem key={item.key}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActivePath(pathname, href)}
                      >
                        {adminNavigationLink({
                          branch,
                          item,
                          owner,
                          repo,
                        })}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
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

function adminNavigationLink({
  branch,
  item,
  owner,
  repo,
}: {
  branch: string
  item: { key: string; label: string; icon: ReactNode }
  owner: string
  repo: string
}) {
  const content = (
    <>
      {item.icon}
      <span>{item.label}</span>
    </>
  )
  const params = { owner, repo, branch }
  switch (item.key) {
    case 'cache':
      return (
        <Link params={params} to="/$owner/$repo/$branch/cache">
          {content}
        </Link>
      )
    case 'actions':
      return (
        <Link params={params} to="/$owner/$repo/$branch/actions">
          {content}
        </Link>
      )
    case 'collaborators':
      return (
        <Link params={params} to="/$owner/$repo/$branch/collaborators">
          {content}
        </Link>
      )
    default:
      return (
        <Link params={params} to="/$owner/$repo/$branch/configuration">
          {content}
        </Link>
      )
  }
}

function RepositorySwitcher({
  branch,
  branches,
  owner,
  repo,
}: {
  branch: string
  branches: readonly string[]
  owner: string
  repo: string
}) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [manageOpen, setManageOpen] = useState(false)
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([])
  const [newBranch, setNewBranch] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const sortedBranches = useMemo(
    () => [...branches].sort((left, right) => left.localeCompare(right)),
    [branches],
  )

  async function createBranch() {
    setCreating(true)
    setError(null)
    try {
      const result = await createRepositoryBranch({
        data: { owner, repo, branch: newBranch, source: branch },
      })
      await queryClient.invalidateQueries({
        queryKey: queryKeys.repository({ owner, repo }),
      })
      setManageOpen(false)
      await router.navigate({
        to: '/$owner/$repo/$branch',
        params: { owner, repo, branch: result.branch },
      })
    } catch (cause) {
      setError(cause)
    } finally {
      setCreating(false)
    }
  }

  return (
    <>
      <DropdownMenu
        onOpenChange={(open) => {
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
                className="rounded-md"
                src={`https://github.com/${encodeURIComponent(owner)}.png?size=64`}
              />
              <AvatarFallback className="rounded-md">
                {owner.slice(0, 2).toUpperCase()}
              </AvatarFallback>
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
        <DropdownMenuContent
          align="start"
          className="w-(--radix-dropdown-menu-trigger-width) min-w-56"
        >
          <DropdownMenuItem asChild>
            <a
              href={`https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`}
              rel="noreferrer noopener"
              target="_blank"
            >
              View on GitHub
              <ArrowUpRight className="ml-auto opacity-50" />
            </a>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Branches</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            className="max-h-52 overflow-y-auto"
            value={branch}
            onValueChange={(nextBranch) => {
              void router.navigate({
                to: '/$owner/$repo/$branch',
                params: { owner, repo, branch: nextBranch },
              })
            }}
          >
            {sortedBranches.map((value) => (
              <DropdownMenuRadioItem key={value} value={value}>
                <span className="truncate">{value}</span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setManageOpen(true)}>
            Manage branches
          </DropdownMenuItem>
          {recentProjects.length ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Recently visited</DropdownMenuLabel>
              {recentProjects.map((project) => (
                <DropdownMenuItem
                  asChild
                  key={`${project.owner}/${project.repo}`}
                >
                  <Link params={project} to="/$owner/$repo/$branch">
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
          <DropdownMenuItem asChild>
            <Link to="/">All projects</Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void createBranch()
            }}
          >
            <DialogHeader>
              <DialogTitle>Manage branches</DialogTitle>
              <DialogDescription>
                Create a new branch from {branch}.
              </DialogDescription>
            </DialogHeader>
            <div className="py-5">
              <Field>
                <FieldLabel htmlFor="new-branch">Branch name</FieldLabel>
                <Input
                  autoFocus
                  id="new-branch"
                  placeholder="feature/editor"
                  value={newBranch}
                  onChange={(event) => setNewBranch(event.target.value)}
                />
              </Field>
              <OperationError
                error={error}
                fallback="Could not create branch."
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setManageOpen(false)}
              >
                Cancel
              </Button>
              <Button disabled={creating || !newBranch.trim()} type="submit">
                {creating ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <Plus />
                )}
                Create branch
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
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
