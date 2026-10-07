import { useEffect, useRef, useState } from 'react'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { Link, getRouteApi, useRouter } from '@tanstack/react-router'
import { LoaderCircle, Search } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { Button } from '#/components/ui/button'
import { Badge } from '#/components/ui/badge'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '#/components/ui/input-group'
import { Skeleton } from '#/components/ui/skeleton'
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
import { OperationError } from '#/components/operation-error'
import { PageHeader } from '#/components/page-header'
import { AppHeader, AppHeaderSkeleton } from '#/features/account/app-header'
import { runAdminAction } from '#/functions/admin'
import { adminDashboardQueryOptions } from '#/queries/admin'
import { queryKeys } from '#/queries/keys'

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
  const [filterError, setFilterError] = useState<unknown>(null)
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
    const values = searchValues.current
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
        replace: true,
        resetScroll: false,
        search: {
          query: next.query || undefined,
          repoQuery: next.repoQuery || undefined,
          page: next.page > 1 ? next.page : undefined,
          repoPage: next.repoPage > 1 ? next.repoPage : undefined,
        },
      })
    } catch (cause) {
      if (version === searchVersion.current) setFilterError(cause)
    } finally {
      if (version === searchVersion.current) {
        searchInFlight.current = false
        setFiltering({ query: false, repoQuery: false })
      }
    }
  }
  const [pending, setPending] = useState<PendingAction | null>(null)
  const [running, setRunning] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<unknown>(null)
  const search = {
    query: data.query || undefined,
    page: data.page > 1 ? data.page : undefined,
    repoQuery: data.repoQuery || undefined,
    repoPage: data.repoPage > 1 ? data.repoPage : undefined,
  }
  async function run(value: PendingAction) {
    setPending(null)
    setRunning(value.userId ?? value.target ?? value.action)
    setError(null)
    setMessage(null)
    try {
      const result = await runAdminAction({ data: value })
      if (result.signedOut) {
        window.location.assign('/sign-in')
        return
      }
      setMessage(result.message)
      await queryClient.invalidateQueries({ queryKey: queryKeys.admin() })
    } catch (cause) {
      setError(cause)
    } finally {
      setRunning(null)
    }
  }
  const cacheRows = [
    {
      target: 'content' as const,
      title: 'Content',
      description: 'Cached files and directory listings.',
      counts: [
        `${data.metrics.cachedFiles} files`,
        `${data.metrics.cacheMetadata} directories`,
      ],
      empty: data.metrics.cachedFiles + data.metrics.cacheMetadata === 0,
    },
    {
      target: 'configuration' as const,
      title: 'Configuration',
      description: 'Cached repository configurations.',
      counts: [`${data.metrics.configurations} configurations`],
      empty: data.metrics.configurations === 0,
    },
  ]
  function clear(target: CacheTarget) {
    setPending({
      action: 'reset-cache',
      target,
      title: target === 'all' ? 'Clear all cache?' : `Clear ${target} cache?`,
      description:
        'Cached data will be fetched again when needed. Repository records, collaborators, and source files are not deleted.',
    })
  }
  function navigate(next: typeof search) {
    void router.navigate({ to: '/admin', search: next })
  }
  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader isAdmin={false} user={data.user} />
      <main className="mx-auto w-full max-w-[808px] space-y-10 p-4 pt-20 pb-8 md:p-6 md:pt-22 md:pb-10">
        <PageHeader title="Admin settings" />
        {message ? (
          <p role="status" className="text-sm text-muted-foreground">
            {message}
          </p>
        ) : null}
        <OperationError error={error} fallback="Admin action failed." />
        <OperationError
          error={filterError}
          fallback="Could not filter results. Previous results are still shown."
        />
        <section aria-label="Users" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-medium">Users</h2>
            <div className="flex flex-wrap items-center gap-2">
              <InputGroup className="h-7 w-48">
                <InputGroupInput
                  className="h-full"
                  maxLength={100}
                  aria-label="Search users"
                  placeholder="Search users"
                  value={query}
                  onChange={(event) => filter('query', event.target.value)}
                />
                <InputGroupAddon>
                  {filtering.query ? (
                    <LoaderCircle
                      aria-label="Filtering users"
                      className="animate-spin"
                    />
                  ) : (
                    <Search />
                  )}
                </InputGroupAddon>
              </InputGroup>
              <Button
                size="sm"
                variant="destructive"
                disabled={running !== null}
                onClick={() =>
                  setPending({
                    action: 'revoke-all',
                    title: 'Revoke all sessions?',
                    description:
                      'Every user, including you, will be signed out.',
                  })
                }
              >
                Revoke all sessions
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
                  {['Name', 'Email', 'GitHub', 'Joined', ''].map((label) => (
                    <th key={label} className="px-4 py-3 font-medium">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {!data.users.length ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-3 text-center text-muted-foreground"
                    >
                      No users found.
                    </td>
                  </tr>
                ) : null}
                {data.users.map((user) => (
                  <tr key={user.id}>
                    <td className="max-w-48 truncate px-4 py-3 font-medium">
                      {user.name}
                    </td>
                    <td className="max-w-64 truncate px-4 py-3">
                      {user.email}
                    </td>
                    <td className="px-4 py-3">
                      {user.githubLinked && user.githubUsername
                        ? `@${user.githubUsername}`
                        : '—'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-0 text-right">
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={running !== null}
                        onClick={() =>
                          setPending({
                            action: 'revoke-user',
                            userId: user.id,
                            title: `Revoke sessions for ${user.name}?`,
                            description:
                              'This user will be signed out of every session. Their account and repository access remain unchanged.',
                          })
                        }
                      >
                        {running === user.id ? (
                          <LoaderCircle className="animate-spin" />
                        ) : null}
                        Revoke sessions
                      </Button>
                    </td>
                  </tr>
                ))}
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
        <section aria-label="Repositories" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-medium">Repositories</h2>
            <InputGroup className="h-7 w-48">
              <InputGroupInput
                className="h-full"
                maxLength={100}
                aria-label="Search repositories"
                placeholder="Search repositories"
                value={repoQuery}
                onChange={(event) => filter('repoQuery', event.target.value)}
              />
              <InputGroupAddon>
                {filtering.repoQuery ? (
                  <LoaderCircle
                    aria-label="Filtering repositories"
                    className="animate-spin"
                  />
                ) : (
                  <Search />
                )}
              </InputGroupAddon>
            </InputGroup>
          </div>
          <div className={tableClass}>
            <table
              aria-busy={filtering.repoQuery}
              className="w-full text-left text-sm"
            >
              <thead className="border-b text-muted-foreground">
                <tr>
                  {['Repository', 'Collaborators', 'Last opened', ''].map(
                    (label) => (
                      <th key={label} className="px-4 py-3 font-medium">
                        {label}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="divide-y">
                {!data.repositories.length ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-3 text-center text-muted-foreground"
                    >
                      {data.repoQuery
                        ? 'No repositories found.'
                        : 'No repositories have been opened yet.'}
                    </td>
                  </tr>
                ) : null}
                {data.repositories.map((repo) => (
                  <tr key={`${repo.source}/${repo.owner}/${repo.repo}`}>
                    <td className="px-4 py-3 font-medium">
                      {repo.owner}/{repo.repo}
                    </td>
                    <td className={cellClass}>{repo.collaborators}</td>
                    <td className="px-4 py-3">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <time dateTime={repo.lastOpenedAt} tabIndex={0}>
                              {formatDistanceToNow(
                                new Date(repo.lastOpenedAt),
                                { addSuffix: true },
                              )}
                            </time>
                          </TooltipTrigger>
                          <TooltipContent>
                            {new Intl.DateTimeFormat(undefined, {
                              dateStyle: 'full',
                              timeStyle: 'long',
                            }).format(new Date(repo.lastOpenedAt))}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </td>
                    <td className="px-4 py-0 text-right">
                      {repo.source === 'github.com' ? (
                        <Button asChild size="sm" variant="outline">
                          <Link
                            to="/$owner/$repo"
                            params={{ owner: repo.owner, repo: repo.repo }}
                          >
                            Open
                          </Link>
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
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
        <section aria-label="Cache" className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium">Cache</h2>
            <Button
              size="sm"
              variant="destructive"
              disabled={running !== null || cacheRows.every((row) => row.empty)}
              onClick={() => clear('all')}
            >
              Clear all
            </Button>
          </div>
          <div className="divide-y rounded-xl border bg-card">
            {cacheRows.map((row) => (
              <div
                key={row.target}
                className="flex items-center justify-between gap-4 p-4"
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
                  <p className="mt-1 text-sm text-muted-foreground">
                    {row.description}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={running !== null || row.empty}
                  onClick={() => clear(row.target)}
                >
                  {running === row.target ? (
                    <LoaderCircle className="animate-spin" />
                  ) : null}
                  Clear
                </Button>
              </div>
            ))}
          </div>
        </section>
      </main>
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
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => pending && void run(pending)}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
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
  if (!total || pages <= 1) return null
  const start = (page - 1) * pageSize + 1
  const countText = shown
    ? `Showing ${start} to ${start + shown - 1} of ${total}`
    : `Showing 0 of ${total}`
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
          size="sm"
          variant="outline"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          Previous
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  )
}
export function AdminSkeleton() {
  return (
    <div className="flex min-h-screen flex-col">
      <AppHeaderSkeleton />
      <main
        aria-label="Loading admin settings"
        className="mx-auto w-full max-w-[808px] space-y-10 p-4 pt-20 pb-8 md:p-6 md:pt-22 md:pb-10"
      >
        <PageHeader title="Admin settings" />
        {['Users', 'Repositories', 'Cache'].map((title) => (
          <section key={title} className="space-y-3">
            <h2 className="text-sm font-medium">{title}</h2>
            <div className="divide-y rounded-xl border bg-card">
              {Array.from({ length: 3 }, (_, index) => (
                <div key={index} className="p-4">
                  <Skeleton className="h-6 w-full" />
                </div>
              ))}
            </div>
          </section>
        ))}
      </main>
    </div>
  )
}
