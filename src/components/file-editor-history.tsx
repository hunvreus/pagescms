import { useState } from 'react'
import { ArrowUpRight, History, LoaderCircle } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '#/components/ui/avatar'
import { Button } from '#/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { Skeleton } from '#/components/ui/skeleton'
import { useRepositoryGitHubLink } from '#/hooks/use-repository-github-link'
import type { getEntryHistory } from '#/functions/entry-editor'

export function FileEditorHistory({
  coordinates,
  load,
}: {
  coordinates: { owner: string; repo: string; branch: string; path: string }
  load: () => Promise<Awaited<ReturnType<typeof getEntryHistory>>>
}) {
  const canViewGitHub = useRepositoryGitHubLink()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState<
    Awaited<ReturnType<typeof getEntryHistory>> | undefined
  >()
  const [error, setError] = useState<unknown>(null)

  async function loadHistory() {
    if (history || loading) return
    setLoading(true)
    setError(null)
    try {
      setHistory(await load())
    } catch (cause) {
      setError(cause)
    } finally {
      setLoading(false)
    }
  }

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (nextOpen) void loadHistory()
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          aria-label="Entry history"
          size="icon"
          type="button"
          variant="outline"
        >
          {loading ? <LoaderCircle className="animate-spin" /> : <History />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-64 max-w-[calc(100vw-2rem)]"
      >
        {error ? (
          <DropdownMenuItem disabled>Could not load history.</DropdownMenuItem>
        ) : loading || !history ? (
          <div role="status" aria-label="Loading history">
            {Array.from({ length: 3 }, (_, index) => (
              <div key={index} className="flex items-center gap-3 px-1.5 py-1">
                <Skeleton className="size-6 shrink-0 rounded-full dark:bg-foreground/10" />
                <div className="min-w-0 flex-1">
                  <span className="flex h-5 items-center">
                    <Skeleton className="h-4 w-28 dark:bg-foreground/10" />
                  </span>
                  <span className="flex h-4 items-center">
                    <Skeleton className="h-3 w-36 dark:bg-foreground/10" />
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : history.length ? (
          history.slice(0, 3).map((commit) => (
            <DropdownMenuItem asChild key={commit.sha}>
              <a
                className="min-w-0 gap-3"
                href={canViewGitHub ? commit.url : undefined}
                rel="noreferrer"
                target="_blank"
              >
                <Avatar size="sm">
                  <AvatarImage
                    alt={`${commit.authorName}'s avatar`}
                    src={
                      commit.authorLogin
                        ? `https://github.com/${commit.authorLogin}.png`
                        : undefined
                    }
                  />
                  <AvatarFallback>
                    {historyInitials(commit.authorName)}
                  </AvatarFallback>
                </Avatar>
                <span className="min-w-0">
                  <span className="block truncate">{commit.authorName}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {commit.authoredAt
                      ? new Date(commit.authoredAt).toLocaleString()
                      : 'Unknown date'}
                  </span>
                </span>
              </a>
            </DropdownMenuItem>
          ))
        ) : (
          <DropdownMenuItem disabled className="text-muted-foreground">
            No history found.
          </DropdownMenuItem>
        )}
        {canViewGitHub ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <a
                className="whitespace-nowrap"
                href={`https://github.com/${encodeURIComponent(coordinates.owner)}/${encodeURIComponent(coordinates.repo)}/commits/${encodeURIComponent(coordinates.branch)}/${coordinates.path.split('/').map(encodeURIComponent).join('/')}`}
                rel="noreferrer"
                target="_blank"
              >
                View on GitHub
                <ArrowUpRight className="ml-auto opacity-50" />
              </a>
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function historyInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}
