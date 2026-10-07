import { useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { OperationError } from '#/components/operation-error'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '#/components/ui/alert-dialog'
import { Button } from '#/components/ui/button'
import { Badge } from '#/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '#/components/ui/tooltip'
import { updateCache } from '#/functions/cache'
import { queryKeys } from '#/queries/keys'
import { cacheStatusQueryOptions } from '#/queries/repository'
import { RepositoryAdminPage } from './repository-admin-page'

type CacheAction =
  | 'reconcile-content'
  | 'clear-content'
  | 'refresh-configuration'
  | 'clear-configuration'
  | 'clear-all'
type Confirmation = { action: CacheAction; title: string; description: string }

export function CachePage({
  owner,
  repo,
  branch,
  embedded = false,
}: {
  owner: string
  repo: string
  branch: string
  embedded?: boolean
}) {
  const params = { owner, repo, branch }
  const { data } = useSuspenseQuery(cacheStatusQueryOptions(params))
  const queryClient = useQueryClient()
  const [running, setRunning] = useState<CacheAction | null>(null)
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<unknown>(null)
  async function run(action: CacheAction) {
    setRunning(action)
    setMessage(null)
    setError(null)
    try {
      const result = await updateCache({ data: { ...params, action } })
      setMessage(result.message)
      await queryClient.invalidateQueries({
        queryKey: queryKeys.branch(params),
      })
    } catch (cause) {
      setError(cause)
    } finally {
      setRunning(null)
    }
  }
  const rows: Array<{
    title: string
    description: string
    status: string
    counts?: string[]
    checkedAt?: string
    refresh?: CacheAction
    canRefresh?: boolean
    clear: CacheAction
    empty: boolean
  }> = [
    {
      title: 'Content',
      description:
        'Refresh checks GitHub for changes. Clear removes cached files and listings until they are needed again.',
      status: '',
      counts: [`${data.fileCount} files`, `${data.directoryCount} directories`],
      refresh: 'reconcile-content',
      canRefresh: data.directoryCount > 0,
      clear: 'clear-content',
      empty: data.fileCount === 0 && data.directoryCount === 0,
    },
    {
      title: 'Configuration',
      description:
        'Refresh reloads and validates .pages.yml now. Clear discards the snapshot until the next request.',
      status: data.configuration
        ? `Last checked ${formatDistanceToNow(new Date(data.configuration.lastCheckedAt), { addSuffix: true })}`
        : 'Not cached',
      checkedAt: data.configuration?.lastCheckedAt,
      refresh: 'refresh-configuration',
      canRefresh: true,
      clear: 'clear-configuration',
      empty: data.configuration === null,
    },
  ]
  return (
    <RepositoryAdminPage
      embedded={embedded}
      title="Cache"
      actions={
        <Button
          size="sm"
          variant="destructive"
          disabled={running !== null || rows.every((row) => row.empty)}
          onClick={() =>
            setConfirmation({
              action: 'clear-all',
              title: 'Clear all cached data?',
              description:
                'Content, configuration, and permissions will be fetched again when next needed.',
            })
          }
        >
          Clear all
        </Button>
      }
    >
      <OperationError error={error} fallback="Could not update the cache." />
      {message ? (
        <p role="status" className="text-sm text-muted-foreground">
          {message}
        </p>
      ) : null}
      <div className="divide-y rounded-xl border bg-card">
        {rows.map((row) => (
          <div
            key={row.title}
            className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-medium">{row.title}</h3>
                {row.counts ? (
                  row.counts.map((value) => (
                    <Badge
                      key={value}
                      variant="secondary"
                      className="text-muted-foreground"
                    >
                      {value}
                    </Badge>
                  ))
                ) : row.checkedAt ? (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge
                          variant="secondary"
                          className="text-muted-foreground"
                          tabIndex={0}
                        >
                          {row.status}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>
                        {new Intl.DateTimeFormat(undefined, {
                          dateStyle: 'full',
                          timeStyle: 'long',
                        }).format(new Date(row.checkedAt))}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : (
                  <Badge variant="secondary" className="text-muted-foreground">
                    {row.status}
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {row.description}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              {row.refresh ? (
                <Button
                  size="sm"
                  variant="outline"
                  aria-label={`Refresh ${row.title.toLowerCase()} cache`}
                  disabled={running !== null || !row.canRefresh}
                  onClick={() => {
                    if (row.refresh) void run(row.refresh)
                  }}
                >
                  {running === row.refresh ? 'Refreshing…' : 'Refresh'}
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="destructive"
                aria-label={`Clear ${row.title === 'Permissions' ? 'permission' : row.title.toLowerCase()} cache`}
                disabled={running !== null || row.empty}
                onClick={() =>
                  setConfirmation({
                    action: row.clear,
                    title: `Clear ${row.title === 'Permissions' ? 'permission' : row.title.toLowerCase()} cache?`,
                    description: row.description,
                  })
                }
              >
                Clear
              </Button>
            </div>
          </div>
        ))}
      </div>
      <AlertDialog
        open={confirmation !== null}
        onOpenChange={(open) => !open && setConfirmation(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmation?.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmation?.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                const action = confirmation?.action
                setConfirmation(null)
                if (action) void run(action)
              }}
            >
              Clear
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </RepositoryAdminPage>
  )
}
