import { plural } from '@lingui/core/macro'
import { useLingui } from '@lingui/react'
import {
  Trans as UiTrans,
  useLingui as useUiMessages,
} from '@lingui/react/macro'
import { notifyError } from '#/lib/notifications'
import { Spinner } from '#/components/ui/spinner'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { Link, getRouteApi, useRouter } from '@tanstack/react-router'
import { formatDistanceToNow } from '#/i18n/dates'
import { Button } from '#/components/ui/button'
import { Badge } from '#/components/ui/badge'
import { SearchInput } from '#/components/search-input'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '#/components/ui/tooltip'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '#/components/ui/alert-dialog'
import { TableErrorRow } from '#/components/ui/table'
import { SettingsLayout } from '#/components/settings-layout'
import { adminNavigation } from '#/features/settings/settings-navigation'
import { adminColumns } from './admin-loading'
import { SignInAllowlist } from './sign-in-allowlist'
import { runAdminAction } from '#/client/api/admin'
import { adminDashboardQueryOptions } from '#/client/queries/admin'
import { queryKeys } from '#/client/queries/keys'

type CacheTarget = 'all' | 'content' | 'configuration'
type PendingAction = {
  action: 'revoke-user' | 'revoke-all' | 'reset-cache'
  userId?: string
  target?: CacheTarget
  title: string
  description: string
}
const tableClass = 'scrollbar overflow-x-auto rounded-xl border bg-card'
const cellClass = 'px-4 py-3'

export function AdminPage() {
  const { t: _t, i18n: columnsI18n } = useUiMessages()
  const { i18n: dateI18n } = useLingui()

  const deps = getRouteApi('/admin').useLoaderDeps()
  const { data } = useSuspenseQuery(adminDashboardQueryOptions(deps))
  const router = useRouter()
  const queryClient = useQueryClient()
  const [query, setQuery] = useState(data.query)
  const [repoQuery, setRepoQuery] = useState(data.repoQuery)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  )
  const searchVersion = useRef(0)
  const searchInFlight = useRef(false)
  const searchValues = useRef({ query: data.query, repoQuery: data.repoQuery })
  const [filtering, setFiltering] = useState({ query: false, repoQuery: false })
  const [filterError, setFilterError] = useState<{
    query: boolean
    repoQuery: boolean
  } | null>(null)
  useEffect(
    () => () => {
      clearTimeout(searchTimer.current)
      searchVersion.current += 1
    },
    [],
  )
  useEffect(() => {
    if (!searchTimer.current && !searchInFlight.current) {
      setQuery(data.query)
      setRepoQuery(data.repoQuery)
      searchValues.current = { query: data.query, repoQuery: data.repoQuery }
    }
  }, [data.query, data.repoQuery])
  function filter(name: 'query' | 'repoQuery', value: string) {
    if (name === 'query') setQuery(value)
    else setRepoQuery(value)
    searchValues.current[name] = value
    const version = ++searchVersion.current
    setFiltering((previous) => ({ ...previous, [name]: true }))
    setFilterError(null)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      searchTimer.current = undefined
      void applyFilter(version)
    }, 250)
  }
  async function applyFilter(version: number) {
    searchInFlight.current = true
    const values = { ...searchValues.current }
    const next = {
      query: values.query.trim(),
      repoQuery: values.repoQuery.trim(),
      page: values.query.trim() === data.query ? data.page : 1,
      repoPage: values.repoQuery.trim() === data.repoQuery ? data.repoPage : 1,
    }
    try {
      // Fill the destination cache before navigation so filtering never replaces rows with a route skeleton.
      await queryClient.fetchQuery(adminDashboardQueryOptions(next))
      if (version !== searchVersion.current) return
      await router.navigate({
        to: '/admin',
        hash: (previous) => previous ?? '',
        replace: true,
        resetScroll: false,
        search: {
          query: next.query || undefined,
          repoQuery: next.repoQuery || undefined,
          page: next.page > 1 ? next.page : undefined,
          repoPage: next.repoPage > 1 ? next.repoPage : undefined,
        },
      })
      if (version === searchVersion.current) setFilterError(null)
    } catch {
      if (version === searchVersion.current) {
        const queryChanged = next.query !== data.query
        const repoQueryChanged = next.repoQuery !== data.repoQuery
        setFilterError({
          query: queryChanged || !repoQueryChanged,
          repoQuery: repoQueryChanged || !queryChanged,
        })
      }
    } finally {
      if (version === searchVersion.current) {
        searchInFlight.current = false
        setFiltering({ query: false, repoQuery: false })
      }
    }
  }
  function retryFilter() {
    if (!filterError) return
    setFiltering(filterError)
    void applyFilter(++searchVersion.current)
  }
  const [pending, setPending] = useState<PendingAction | null>(null)
  const [running, setRunning] = useState<string | null>(null)
  const search = {
    query: data.query || undefined,
    page: data.page > 1 ? data.page : undefined,
    repoQuery: data.repoQuery || undefined,
    repoPage: data.repoPage > 1 ? data.repoPage : undefined,
  }
  async function run(value: PendingAction) {
    setPending(null)
    setRunning(value.userId ?? value.target ?? value.action)
    try {
      const result = await runAdminAction(value)
      if (result.signedOut) {
        window.location.assign('/sign-in')
        return
      }
      const { toast } = await import('#/lib/notifications')
      toast.success(result.message)
      await queryClient.invalidateQueries({ queryKey: queryKeys.admin() })
    } catch (cause) {
      notifyError(cause, _t({ message: 'Admin action failed.' }), {
        account: data.user.id,
      })
    } finally {
      setRunning(null)
    }
  }
  const cacheRows = [
    {
      target: 'content' as const,
      title: _t({ message: 'Content' }),
      description: _t({ message: 'Cached files and directory listings.' }),
      counts: [
        `${data.metrics.cachedFiles} files`,
        `${data.metrics.cacheMetadata} directories`,
      ],
      empty: data.metrics.cachedFiles + data.metrics.cacheMetadata === 0,
    },
    {
      target: 'configuration' as const,
      title: _t({ message: 'Configuration' }),
      description: _t({ message: 'Cached repository configurations.' }),
      counts: [
        _t({
          message: plural(data.metrics.configurations, {
            one: '# configuration',
            other: '# configurations',
          }),
        }),
      ],
      empty: data.metrics.configurations === 0,
    },
  ]
  function clear(target: CacheTarget) {
    setPending({
      action: 'reset-cache',
      target,
      title:
        target === 'all'
          ? _t({ message: 'Clear all cache?' })
          : target === 'content'
            ? _t({ message: 'Clear content cache?' })
            : _t({ message: 'Clear configuration cache?' }),
      description: _t({
        message:
          'Cached data will be fetched again when needed. Repository records, collaborators, and source files are not deleted.',
      }),
    })
  }
  function navigate(next: typeof search) {
    void router.navigate({
      to: '/admin',
      hash: (previous) => previous ?? '',
      resetScroll: false,
      search: next,
    })
  }
  const repositoryRows = useMemo(
    () =>
      data.repositories.map((repo) => (
        <tr key={`${repo.source}/${repo.owner}/${repo.repo}`}>
          <td className="px-4 py-3 font-medium">
            {repo.owner}/{repo.repo}
          </td>
          <td className={cellClass}>{repo.collaborators}</td>
          <td className="px-4 py-3">
            {repo.lastOpenedAt ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <time dateTime={repo.lastOpenedAt} tabIndex={0}>
                      {formatDistanceToNow(
                        new Date(repo.lastOpenedAt),
                        {
                          addSuffix: true,
                        },
                        dateI18n.locale,
                      )}
                    </time>
                  </TooltipTrigger>
                  <TooltipContent>
                    {new Intl.DateTimeFormat(dateI18n.locale, {
                      dateStyle: 'full',
                      timeStyle: 'long',
                      timeZone: 'UTC',
                    }).format(new Date(repo.lastOpenedAt))}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              '—'
            )}
          </td>
          <td className="px-4 py-0 text-right">
            {repo.source === 'github.com' ? (
              <Button asChild size="sm" variant="outline">
                <Link
                  to="/github/$owner/$repo"
                  params={{ owner: repo.owner, repo: repo.repo }}
                >
                  <UiTrans>Open</UiTrans>
                </Link>
              </Button>
            ) : null}
          </td>
        </tr>
      )),
    [data.repositories, dateI18n.locale],
  )

  return (
    <SettingsLayout
      area="Admin"
      items={adminNavigation}
      isAdmin
      user={data.user}
    >
      <SignInAllowlist />
      <section
        id="users"
        aria-label={_t({ message: 'Users' })}
        className="scroll-mt-6 space-y-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-medium">
            <UiTrans>Users</UiTrans>
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              groupClassName="w-48"
              loading={filtering.query}
              loadingLabel={_t({ message: 'Filtering users' })}
              maxLength={100}
              aria-label={_t({ message: 'Search users' })}
              placeholder={_t({ message: 'Search users' })}
              value={query}
              onChange={(event) => filter('query', event.target.value)}
            />
            <Button
              aria-busy={running === 'revoke-all'}
              variant="destructive"
              disabled={running !== null}
              onClick={() =>
                setPending({
                  action: 'revoke-all',
                  title: _t({ message: 'Revoke all sessions?' }),
                  description: _t({
                    message:
                      'Every user, including you, will be signed out. All integration credentials will be revoked.',
                  }),
                })
              }
            >
              <UiTrans>Revoke all sessions</UiTrans>
              {running === 'revoke-all' ? (
                <Spinner aria-hidden="true" data-icon="inline-end" />
              ) : null}
            </Button>
          </div>
        </div>
        <div className={tableClass}>
          <table
            aria-busy={filtering.query}
            className="w-full text-left text-sm"
          >
            <thead className="border-b text-muted-foreground">
              <tr>
                {adminColumns.users.map((label) => (
                  <th
                    key={typeof label === 'string' ? label : label.id}
                    className="px-4 py-3 font-medium"
                  >
                    {typeof label === 'string' ? label : columnsI18n._(label)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {!data.users.length && !filterError?.query ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-3 text-center text-muted-foreground"
                  >
                    <UiTrans>No users found.</UiTrans>
                  </td>
                </tr>
              ) : null}
              {data.users.map((user) => (
                <tr key={user.id}>
                  <td className="max-w-48 truncate px-4 py-3 font-medium">
                    {user.name}
                  </td>
                  <td className="max-w-64 truncate px-4 py-3">{user.email}</td>
                  <td className="px-4 py-3">
                    {user.githubLinked && user.githubUsername
                      ? `@${user.githubUsername}`
                      : '—'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {new Date(user.createdAt).toLocaleDateString(
                      dateI18n.locale,
                      { timeZone: 'UTC' },
                    )}
                  </td>
                  <td className="px-4 py-0 text-right">
                    <Button
                      aria-busy={running === user.id}
                      size="sm"
                      variant="destructive"
                      disabled={running !== null}
                      onClick={() =>
                        setPending({
                          action: 'revoke-user',
                          userId: user.id,
                          title: _t({
                            message: `Revoke sessions for ${user.name}?`,
                          }),
                          description: _t({
                            message:
                              'This user will be signed out of every session and their integration credentials will be revoked. They can sign in again.',
                          }),
                        })
                      }
                    >
                      <UiTrans>Revoke sessions</UiTrans>
                      {running === user.id ? (
                        <Spinner aria-hidden="true" data-icon="inline-end" />
                      ) : null}
                    </Button>
                  </td>
                </tr>
              ))}
              {filterError?.query ? (
                <TableErrorRow
                  colSpan={5}
                  message={_t({
                    message:
                      'Could not filter results. Previous results are still shown.',
                  })}
                  onRetry={retryFilter}
                  retrying={filtering.query}
                />
              ) : null}
            </tbody>
          </table>
        </div>
        <Pager
          total={data.matchingUsers}
          shown={data.users.length}
          pageSize={data.pageSize}
          page={data.page}
          pages={data.pages}
          onPage={(page) =>
            navigate({ ...search, page: page > 1 ? page : undefined })
          }
        />
      </section>
      <section
        id="repositories"
        aria-label={_t({ message: 'Repositories' })}
        className="scroll-mt-6 space-y-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-medium">
            <UiTrans>Repositories</UiTrans>
          </h2>
          <SearchInput
            groupClassName="w-48"
            loading={filtering.repoQuery}
            loadingLabel={_t({ message: 'Filtering repositories' })}
            maxLength={100}
            aria-label={_t({ message: 'Search repositories' })}
            placeholder={_t({ message: 'Search repositories' })}
            value={repoQuery}
            onChange={(event) => filter('repoQuery', event.target.value)}
          />
        </div>
        <div className={tableClass}>
          <table
            aria-busy={filtering.repoQuery}
            className="w-full text-left text-sm"
          >
            <thead className="border-b text-muted-foreground">
              <tr>
                {adminColumns.repositories.map((label) => (
                  <th
                    key={typeof label === 'string' ? label : label.id}
                    className="px-4 py-3 font-medium"
                  >
                    {typeof label === 'string' ? label : columnsI18n._(label)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {!data.repositories.length && !filterError?.repoQuery ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-3 text-center text-muted-foreground"
                  >
                    {data.repoQuery
                      ? _t({ message: 'No repositories found.' })
                      : _t({
                          message: 'No repositories have been opened yet.',
                        })}
                  </td>
                </tr>
              ) : null}
              {repositoryRows}
              {filterError?.repoQuery ? (
                <TableErrorRow
                  colSpan={4}
                  message={_t({
                    message:
                      'Could not filter results. Previous results are still shown.',
                  })}
                  onRetry={retryFilter}
                  retrying={filtering.repoQuery}
                />
              ) : null}
            </tbody>
          </table>
        </div>
        <Pager
          total={data.matchingRepositories}
          shown={data.repositories.length}
          pageSize={data.pageSize}
          page={data.repoPage}
          pages={data.repoPages}
          onPage={(repoPage) =>
            navigate({
              ...search,
              repoPage: repoPage > 1 ? repoPage : undefined,
            })
          }
        />
      </section>
      <section
        id="cache"
        aria-label={_t({ message: 'Cache' })}
        className="scroll-mt-6 space-y-3"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-medium">
            <UiTrans>Cache</UiTrans>
          </h2>
          <Button
            aria-busy={running === 'all'}
            variant="destructive"
            disabled={running !== null || cacheRows.every((row) => row.empty)}
            onClick={() => clear('all')}
          >
            <UiTrans>Clear all</UiTrans>
            {running === 'all' ? (
              <Spinner aria-hidden="true" data-icon="inline-end" />
            ) : null}
          </Button>
        </div>
        <div className="divide-y rounded-xl border bg-card px-4">
          {cacheRows.map((row) => (
            <div
              key={row.target}
              className="flex items-center justify-between gap-4 py-4"
            >
              <div>
                <h3 className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {row.title}
                  {row.counts.map((value) => (
                    <Badge
                      key={value}
                      variant="secondary"
                      className="text-muted-foreground"
                    >
                      {value}
                    </Badge>
                  ))}
                </h3>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {row.description}
                </p>
              </div>
              <Button
                aria-busy={running === row.target}
                variant="destructive"
                disabled={running !== null || row.empty}
                onClick={() => clear(row.target)}
              >
                <UiTrans>Clear</UiTrans>
                {running === row.target ? (
                  <Spinner aria-hidden="true" data-icon="inline-end" />
                ) : null}
              </Button>
            </div>
          ))}
        </div>
      </section>
      <AlertDialog
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pending?.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              <UiTrans>Cancel</UiTrans>
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => pending && void run(pending)}
            >
              <UiTrans>Confirm</UiTrans>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsLayout>
  )
}
function Pager({
  total,
  shown,
  pageSize,
  page,
  pages,
  onPage,
}: {
  total: number
  shown: number
  pageSize: number
  page: number
  pages: number
  onPage: (page: number) => void
}) {
  const { t: _t } = useUiMessages()
  if (!total || pages <= 1) return null
  const start = (page - 1) * pageSize + 1
  const countText = shown
    ? _t({ message: `Showing ${start} to ${start + shown - 1} of ${total}` })
    : _t({ message: `Showing 0 of ${total}` })
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <p
        aria-live="polite"
        aria-atomic="true"
        className="text-[0.8rem] text-muted-foreground"
      >
        {countText}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          <UiTrans>Previous</UiTrans>
        </Button>
        <Button
          variant="outline"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
        >
          <UiTrans>Next</UiTrans>
        </Button>
      </div>
    </div>
  )
}
export { AdminSkeleton } from './admin-loading'
