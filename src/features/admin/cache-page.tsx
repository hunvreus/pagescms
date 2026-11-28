import { plural } from '@lingui/core/macro'
import { useLingui } from '@lingui/react'
import {
  Trans as UiTrans,
  useLingui as useUiMessages,
} from '@lingui/react/macro'
import { LoadError } from '#/components/operation-error'
import { HugeiconsIcon } from '@hugeicons/react'
import { Spinner } from '#/components/ui/spinner'
import Trash2 from '@hugeicons/core-free-icons/Delete02Icon'
import { invalidateRepositories } from '#/client/queries/repository-invalidation'
import { repositoryRequest } from '#/lib/repository-identity'
import {
  operationKey,
  refreshQueries,
  useOperation,
} from '#/features/pending-writes/use-operation'
import { useState } from 'react'
import { formatDistanceToNow } from '#/i18n/dates'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
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
import { updateCache } from '#/client/api/cache'
import { queryKeys } from '#/client/queries/keys'
import { cacheStatusQueryOptions } from '#/client/queries/repository'
import { cacheDescriptions } from './cache-copy'
import { CacheFiles } from './cache-files'
import { RepositoryAdminPage } from './repository-admin-page'

type CacheAction = 'clear-content' | 'clear-configuration' | 'clear-all'
type Confirmation = { action: CacheAction; title: string; description: string }

export function CachePage({
  owner,
  repo,
  branch,
  repoId,
}: {
  owner: string
  repo: string
  branch: string
  repoId?: string
}) {
  const { t: _t, i18n: cacheI18n } = useUiMessages()
  const { i18n: dateI18n } = useLingui()

  const params = { owner, repo, branch, repoId }
  const { data, error, isFetching, refetch } = useSuspenseQuery(
    cacheStatusQueryOptions(params),
  )
  const queryClient = useQueryClient()
  const operation = useOperation<Awaited<ReturnType<typeof updateCache>>>(
    operationKey('cache-management', params),
  )
  const [runningAction, setRunningAction] = useState<CacheAction | null>(null)
  const running = operation.pending ? (runningAction ?? 'clear-all') : null
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  async function run(action: CacheAction) {
    if (operation.pending) return
    setRunningAction(action)
    try {
      await operation.run({
        failureMessage: _t({ message: 'Could not update the cache.' }),
        successMessage: (result) => result.message,
        run: () => updateCache({ ...repositoryRequest(params), action }),
        confirmed: (_result, active) => {
          if (!active()) return
          refreshQueries(queryClient, [queryKeys.branch(params)])
          void invalidateRepositories(queryClient, params).catch(() => {})
        },
      })
    } catch {
      // The operation boundary reports this failure.
    } finally {
      setRunningAction(null)
    }
  }
  const rows: Array<{
    key: 'content' | 'configuration'
    title: string
    description: string
    status: string
    counts?: string[]
    checkedAt?: string
    clear: CacheAction
    empty: boolean
  }> = [
    {
      key: 'content',
      title: _t({ message: 'Content' }),
      description: cacheI18n._(cacheDescriptions.Content),
      status: '',
      counts: [
        _t({
          message: plural(data.fileCount, { one: '# file', other: '# files' }),
        }),
        _t({
          message: plural(data.directoryCount, {
            one: '# directory',
            other: '# directories',
          }),
        }),
      ],
      empty: data.fileCount === 0 && data.directoryCount === 0,
      clear: 'clear-content',
    },
    {
      key: 'configuration',
      title: _t({ message: 'Configuration' }),
      description: cacheI18n._(cacheDescriptions.Configuration),
      status: data.configuration
        ? _t({
            message: `Last checked ${formatDistanceToNow(new Date(data.configuration.lastCheckedAt), { addSuffix: true }, dateI18n.locale)}`,
          })
        : _t({ message: 'Not cached' }),
      checkedAt: data.configuration?.lastCheckedAt,
      empty: data.configuration === null,
      clear: 'clear-configuration',
    },
  ]
  return (
    <RepositoryAdminPage
      title={_t({ message: 'Cache' })}
      actions={
        <Button
          aria-label={_t({ message: 'Clear all' })}
          className="max-md:size-8 max-md:p-0 max-md:has-data-[icon=inline-start]:pl-0 max-md:has-data-[icon=inline-end]:pr-0"
          aria-busy={running === 'clear-all'}
          variant="destructive"
          disabled={running !== null || rows.every((row) => row.empty)}
          onClick={() =>
            setConfirmation({
              action: 'clear-all',
              title: _t({ message: 'Clear all cached data?' }),
              description: _t({
                message:
                  'Content and configuration for this branch will be fetched again when next needed.',
              }),
            })
          }
        >
          <HugeiconsIcon
            aria-hidden="true"
            icon={Trash2}
            className={running === 'clear-all' ? 'hidden' : 'md:hidden'}
          />
          <span className="hidden md:inline">
            <UiTrans>Clear all</UiTrans>
          </span>
          {running === 'clear-all' ? (
            <Spinner aria-hidden="true" data-icon="inline-end" />
          ) : null}
        </Button>
      }
    >
      <LoadError
        error={error}
        message={_t({ message: 'Could not refresh cache status.' })}
        stale
        onRetry={() => void refetch()}
        retrying={isFetching}
      />
      <div className="divide-y rounded-xl border bg-card px-4">
        {rows.map((row) => (
          <div key={row.title}>
            <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
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
                            className="max-w-full whitespace-normal text-muted-foreground"
                            tabIndex={0}
                          >
                            {row.status}
                            {row.key === 'configuration' &&
                            data.configuration?.sha ? (
                              <span title={data.configuration.sha}>
                                {' '}
                                <UiTrans>(SHA: </UiTrans>
                                {data.configuration.sha.slice(0, 7)})
                              </span>
                            ) : null}
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent>
                          {new Intl.DateTimeFormat(dateI18n.locale, {
                            dateStyle: 'full',
                            timeStyle: 'long',
                            timeZone: 'UTC',
                          }).format(new Date(row.checkedAt))}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ) : (
                    <Badge
                      variant="secondary"
                      className="max-w-full whitespace-normal text-muted-foreground"
                    >
                      {row.status}
                      {row.key === 'configuration' &&
                      data.configuration?.sha ? (
                        <span title={data.configuration.sha}>
                          {' '}
                          <UiTrans>(SHA: </UiTrans>
                          {data.configuration.sha.slice(0, 7)})
                        </span>
                      ) : null}
                    </Badge>
                  )}
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {row.description}
                </p>
              </div>
              <Button
                aria-busy={running === row.clear}
                variant="destructive"
                aria-label={_t({
                  message: `Clear ${row.title.toLowerCase()} cache`,
                })}
                disabled={running !== null || row.empty}
                onClick={() =>
                  setConfirmation({
                    action: row.clear,
                    title: _t({
                      message: `Clear ${row.title.toLowerCase()} cache?`,
                    }),
                    description: row.description,
                  })
                }
              >
                <UiTrans>Clear</UiTrans>
                {running === row.clear ? (
                  <Spinner aria-hidden="true" data-icon="inline-end" />
                ) : null}
              </Button>
            </div>
            {row.key === 'content' ? <CacheFiles {...params} /> : null}
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
            <AlertDialogCancel>
              <UiTrans>Cancel</UiTrans>
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                const action = confirmation?.action
                setConfirmation(null)
                if (action) void run(action)
              }}
            >
              <UiTrans>Clear</UiTrans>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </RepositoryAdminPage>
  )
}
