import { useLingui } from '@lingui/react'
import {
  Trans as UiTrans,
  useLingui as useUiMessages,
} from '@lingui/react/macro'
import { HugeiconsIcon } from '@hugeicons/react'
import { Spinner } from '#/components/ui/spinner'
import { useState } from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import History from '@hugeicons/core-free-icons/HistoryIcon'
import CircleAlert from '@hugeicons/core-free-icons/AlertCircleIcon'
import { Avatar, AvatarFallback, AvatarImage } from '#/components/ui/avatar'
import { Button } from '#/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { Skeleton } from '#/components/ui/skeleton'
import { useRepositoryGitHubLink } from '#/hooks/use-repository-github-link'
import { authenticationQueryOptions } from '#/client/queries/session'
import { fileHistoryQueryOptions } from '#/client/queries/file-history'
import type { FileHistoryCoordinates } from '#/client/queries/file-history'

export function FileEditorHistory({
  coordinates,
}: {
  coordinates: FileHistoryCoordinates
}) {
  const { t: _t } = useUiMessages()
  const { i18n: dateI18n } = useLingui()

  const canViewGitHub = useRepositoryGitHubLink()
  const [open, setOpen] = useState(false)
  const { data: auth } = useQuery(authenticationQueryOptions())
  const query = useInfiniteQuery({
    ...fileHistoryQueryOptions(coordinates, auth?.user?.id),
    enabled: open && Boolean(auth?.user),
  })
  const history = query.data
    ? [
        ...new Map(
          query.data.pages.flat().map((commit) => [commit.sha, commit]),
        ).values(),
      ]
    : undefined
  const loading = query.isFetching
  const error = query.error
  const hasMore = query.hasNextPage

  function loadHistory() {
    if (loading) return
    if (query.isFetchNextPageError || (!error && history !== undefined))
      void query.fetchNextPage()
    else void query.refetch()
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          aria-busy={loading}
          aria-label={_t({ message: 'Entry history' })}
          size="icon"
          type="button"
          variant="outline"
        >
          {loading ? (
            <Spinner aria-hidden="true" />
          ) : (
            <HugeiconsIcon aria-hidden="true" icon={History} />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="scrollbar-sm max-h-[min(14.25rem,var(--radix-dropdown-menu-content-available-height))] w-64 max-w-[calc(100vw-2rem)]"
      >
        {history === undefined && loading ? (
          <div role="status" aria-label={_t({ message: 'Loading history' })}>
            {Array.from({ length: 5 }, (_, index) => (
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
          <DropdownMenuGroup aria-label={_t({ message: 'History entries' })}>
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
                      alt={_t({ message: `${commit.authorName}'s avatar` })}
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
                        ? new Date(commit.authoredAt).toLocaleString(
                            dateI18n.locale,
                          )
                        : _t({ message: 'Unknown date' })}
                    </span>
                  </span>
                </a>
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        ) : history && !error ? (
          <DropdownMenuItem disabled className="text-muted-foreground">
            <UiTrans>No history found.</UiTrans>
          </DropdownMenuItem>
        ) : null}
        {error ? (
          <div
            role="alert"
            className="flex items-start gap-2 px-2 py-1.5 text-sm text-destructive"
          >
            <HugeiconsIcon
              icon={CircleAlert}
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0"
            />
            <span>
              {history?.length
                ? _t({
                    message:
                      'Could not refresh history. The displayed results may be out of date.',
                  })
                : _t({ message: 'Could not load history.' })}
            </span>
          </div>
        ) : null}
        {(history !== undefined && hasMore) || Boolean(error) ? (
          <DropdownMenuItem
            aria-busy={loading}
            className="justify-center"
            disabled={loading}
            onSelect={(event) => {
              event.preventDefault()
              void loadHistory()
            }}
          >
            {error
              ? _t({ message: 'Try again' })
              : _t({ message: 'Show more' })}
            {loading ? <Spinner aria-hidden="true" /> : null}
          </DropdownMenuItem>
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
