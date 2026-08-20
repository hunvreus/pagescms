import { Link } from '@tanstack/react-router'
import { File, FileStack, FolderOpen, GitBranch, Settings } from 'lucide-react'

import { getConfigurationNavigation } from '#/lib/configuration-navigation'

interface WorkspaceProps {
  children: React.ReactNode
  owner: string
  repo: string
  branch: string
  branches: readonly string[]
  configuration: {
    object: Record<string, unknown>
    stale: boolean
  } | null
}

export function RepositoryWorkspace({
  children,
  owner,
  repo,
  branch,
  branches,
  configuration,
}: WorkspaceProps) {
  const navigation = configuration
    ? getConfigurationNavigation(configuration.object)
    : []

  return (
    <div className="min-h-screen bg-muted/20 md:grid md:grid-cols-[16rem_1fr]">
      <aside className="border-b bg-background md:min-h-screen md:border-b-0 md:border-r">
        <div className="border-b p-4">
          <Link
            className="text-sm text-muted-foreground hover:text-foreground"
            to="/"
          >
            Pages CMS
          </Link>
          <h1 className="mt-2 truncate font-semibold">{repo}</h1>
          <p className="truncate text-xs text-muted-foreground">{owner}</p>
        </div>
        <div className="space-y-4 p-3">
          <label className="block space-y-1.5 text-xs font-medium text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <GitBranch className="size-3.5" /> Branch
            </span>
            <select
              className="h-9 w-full rounded-lg border bg-background px-2 text-sm text-foreground"
              value={branch}
              onChange={(event) => {
                window.location.assign(
                  `/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(event.target.value)}`,
                )
              }}
            >
              {branches.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <nav className="space-y-1" aria-label="Repository content">
            {navigation.map((item) => {
              const Icon =
                item.type === 'collection'
                  ? FileStack
                  : item.type === 'file'
                    ? File
                    : FolderOpen
              const href = `/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(branch)}/${item.type}/${encodeURIComponent(item.name)}`
              return (
                <a
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium hover:bg-muted"
                  href={href}
                  key={`${item.type}:${item.name}`}
                >
                  <Icon className="size-4 text-muted-foreground" />
                  <span className="truncate">{item.label}</span>
                </a>
              )
            })}
            <a
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium hover:bg-muted"
              href={`/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(branch)}/configuration`}
            >
              <Settings className="size-4 text-muted-foreground" />
              Configuration
            </a>
          </nav>
        </div>
      </aside>
      <main className="min-w-0 p-4 md:p-6">{children}</main>
    </div>
  )
}
