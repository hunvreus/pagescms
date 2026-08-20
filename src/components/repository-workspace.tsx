import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import {
  File,
  FileStack,
  FolderOpen,
  Database,
  GitBranch,
  LoaderCircle,
  Plus,
  Play,
  Settings,
  Users,
} from 'lucide-react'

import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { createRepositoryBranch } from '#/functions/repository'
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
  const [showBranchCreator, setShowBranchCreator] = useState(false)
  const [newBranch, setNewBranch] = useState('')
  const [creatingBranch, setCreatingBranch] = useState(false)
  const [branchError, setBranchError] = useState<string | null>(null)

  async function createBranch() {
    setCreatingBranch(true)
    setBranchError(null)
    try {
      const result = await createRepositoryBranch({
        data: { owner, repo, branch: newBranch, source: branch },
      })
      window.location.assign(
        `/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(result.branch)}`,
      )
    } catch (cause) {
      setBranchError(
        cause instanceof Error ? cause.message : 'Could not create branch',
      )
      setCreatingBranch(false)
    }
  }

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
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2 text-xs font-medium text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <GitBranch className="size-3.5" /> Branch
              </span>
              <button
                className="hover:text-foreground"
                type="button"
                onClick={() => {
                  setBranchError(null)
                  setShowBranchCreator((current) => !current)
                }}
              >
                New
              </button>
            </div>
            <select
              aria-label="Branch"
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
            {showBranchCreator ? (
              <form
                className="space-y-2 rounded-lg border bg-muted/30 p-2"
                onSubmit={(event) => {
                  event.preventDefault()
                  void createBranch()
                }}
              >
                <Input
                  aria-label="New branch name"
                  autoFocus
                  className="h-8 bg-background text-xs"
                  placeholder="feature/editor"
                  value={newBranch}
                  onChange={(event) => setNewBranch(event.target.value)}
                />
                {branchError ? (
                  <p className="text-xs text-destructive">{branchError}</p>
                ) : null}
                <div className="flex justify-end gap-1">
                  <Button
                    size="sm"
                    type="button"
                    variant="ghost"
                    onClick={() => setShowBranchCreator(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    disabled={creatingBranch || !newBranch.trim()}
                    size="sm"
                    type="submit"
                  >
                    {creatingBranch ? (
                      <LoaderCircle className="animate-spin" />
                    ) : (
                      <Plus />
                    )}
                    Create
                  </Button>
                </div>
              </form>
            ) : null}
          </div>
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
            <a
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium hover:bg-muted"
              href={`/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(branch)}/collaborators`}
            >
              <Users className="size-4 text-muted-foreground" />
              Collaborators
            </a>
            <a
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium hover:bg-muted"
              href={`/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(branch)}/actions`}
            >
              <Play className="size-4 text-muted-foreground" />
              Actions
            </a>
            <a
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium hover:bg-muted"
              href={`/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(branch)}/cache`}
            >
              <Database className="size-4 text-muted-foreground" />
              Cache
            </a>
          </nav>
        </div>
      </aside>
      <main className="min-w-0 p-4 md:p-6">{children}</main>
    </div>
  )
}
