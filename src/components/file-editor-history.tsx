import { useRef, useState } from 'react'
import { History, LoaderCircle } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '#/components/ui/avatar'
import { Button } from '#/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { HISTORY_PAGE_SIZE } from '#/lib/file-history'
import { OperationError } from '#/components/operation-error'
import { Skeleton } from '#/components/ui/skeleton'
import { useRepositoryGitHubLink } from '#/hooks/use-repository-github-link'
import type { getEntryHistory } from '#/functions/entry-editor'

export function FileEditorHistory({
  load,
}: {
  load: (page: number) => Promise<Awaited<ReturnType<typeof getEntryHistory>>>
}) {
  const canViewGitHub = useRepositoryGitHubLink()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState<
    Awaited<ReturnType<typeof getEntryHistory>> | undefined
  >()
  const [error, setError] = useState<unknown>(null)
  const [hasMore, setHasMore] = useState(true)
  const nextPage = useRef(1)
  const pending = useRef(false)

  async function loadHistory() {
    if (pending.current || !hasMore) return
    pending.current = true
    setLoading(true)
    setError(null)
    try {
      const commits = await load(nextPage.current)
      setHistory((current) => [
        ...new Map(
          [...(current ?? []), ...commits].map((commit) => [
            commit.sha,
            commit,
          ]),
        ).values(),
      ])
      setHasMore(commits.length === HISTORY_PAGE_SIZE)
      nextPage.current += 1
    } catch (cause) {
      setError(cause)
    } finally {
      pending.current = false
      setLoading(false)
    }
  }

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (nextOpen && history === undefined) void loadHistory()
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
        {history === undefined && loading ? (
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
        ) : history?.length ? (
          <DropdownMenuGroup
            aria-label="History entries"
            className="scrollbar-sm max-h-33 overflow-y-auto"
          >
            {history.map((commit) => (
              <DropdownMenuItem asChild key={commit.sha}>
                <a
                  className="h-11 min-w-0 gap-3"
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
            ))}
          </DropdownMenuGroup>
        ) : history ? (
          <DropdownMenuItem disabled className="text-muted-foreground">
            No history found.
          </DropdownMenuItem>
        ) : null}
        <OperationError error={error} fallback="Could not load history." />
        {(history !== undefined && hasMore) || Boolean(error) ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={loading}
              className="justify-center"
              onSelect={(event) => {
                event.preventDefault()
                void loadHistory()
              }}
            >
              {loading ? <LoaderCircle className="animate-spin" /> : null}
              {loading ? 'Loading…' : error ? 'Try again' : 'See more'}
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
