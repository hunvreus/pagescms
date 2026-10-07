import { useEffect, useMemo, useRef, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  ChevronsUpDown,
  LoaderCircle,
  LockKeyhole,
  Search,
  Settings,
} from 'lucide-react'

import { Button, buttonVariants } from '#/components/ui/button'
import { ButtonGroup } from '#/components/ui/button-group'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { Input } from '#/components/ui/input'
import { Skeleton } from '#/components/ui/skeleton'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '#/components/ui/tooltip'
import { OperationError } from '#/components/operation-error'
import { getProjectRepositories } from '#/functions/projects'
import { cn } from '#/lib/utils'
import { queryKeys } from '#/queries/keys'

import { relativeTime } from './relative-time'

import type { ProjectAccount } from '#/server/projects.server'

function useDebouncedValue(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(timeout)
  }, [delay, value])
  return debounced
}

function installationUrl(account: ProjectAccount) {
  return account.type === 'org'
    ? `https://github.com/organizations/${encodeURIComponent(account.login)}/settings/installations/${account.installationId}`
    : `https://github.com/settings/installations/${account.installationId}`
}

function accountKey(account: ProjectAccount) {
  return `${account.login}:${account.installationId}`
}

export function ProjectSelector({
  accounts,
  onAccountSelect,
}: {
  accounts: readonly ProjectAccount[]
  onAccountSelect?: (account: ProjectAccount) => void
}) {
  const [selectedKey, setSelectedKey] = useState(() =>
    accounts[0] ? accountKey(accounts[0]) : '',
  )
  const [keyword, setKeyword] = useState('')
  const selectedAccount = accounts.find(
    (account) => accountKey(account) === selectedKey,
  )

  useEffect(() => {
    if (!selectedAccount && accounts[0]) setSelectedKey(accountKey(accounts[0]))
  }, [accounts, selectedAccount])

  useEffect(() => {
    if (selectedAccount) onAccountSelect?.(selectedAccount)
  }, [onAccountSelect, selectedAccount])

  const debouncedKeyword = useDebouncedValue(keyword.trim(), 500)
  const remoteKeyword =
    selectedAccount?.repositorySelection === 'all' ? debouncedKeyword : ''
  const searchIsSettling =
    selectedAccount?.repositorySelection === 'all' &&
    keyword.trim() !== debouncedKeyword
  const repositories = useQuery({
    queryKey: [
      ...queryKeys.repositories(),
      'project-list',
      selectedAccount?.login.toLowerCase(),
      selectedAccount?.installationId,
      remoteKeyword.toLowerCase(),
    ],
    queryFn: () =>
      selectedAccount
        ? getProjectRepositories({
            data: { account: selectedAccount, keyword: remoteKeyword },
          })
        : Promise.resolve([]),
    enabled: Boolean(selectedAccount),
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    placeholderData: keepPreviousData,
  })
  const lastResults = useRef({
    account: selectedKey,
    values: repositories.data,
  })
  useEffect(() => {
    if (repositories.isSuccess && !repositories.isPlaceholderData) {
      lastResults.current = { account: selectedKey, values: repositories.data }
    }
  }, [
    repositories.data,
    repositories.isSuccess,
    repositories.isPlaceholderData,
    selectedKey,
  ])
  const results =
    repositories.data ??
    (lastResults.current.account === selectedKey
      ? lastResults.current.values
      : undefined)
  const filtering = searchIsSettling || repositories.isFetching

  const visibleRepositories = useMemo(() => {
    const values = results ?? []
    if (selectedAccount?.repositorySelection === 'all') return values
    const normalizedKeyword = keyword.trim().toLowerCase()
    if (!normalizedKeyword) return values
    return values.filter((repository) =>
      repository.repo.toLowerCase().includes(normalizedKeyword),
    )
  }, [keyword, results, selectedAccount?.repositorySelection])

  if (!selectedAccount) return null

  return (
    <div className="flex flex-col gap-4">
      <div className="flex w-full items-center gap-2">
        <ButtonGroup>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="min-w-32 px-2.5" variant="outline">
                <img
                  alt={`${selectedAccount.login}'s avatar`}
                  className="size-6 rounded"
                  src={`https://github.com/${encodeURIComponent(selectedAccount.login)}.png?size=48`}
                />
                <span className="max-w-32 truncate">
                  {selectedAccount.login}
                </span>
                <ChevronsUpDown className="ml-auto opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-48">
              {accounts.map((account) => (
                <DropdownMenuItem
                  key={accountKey(account)}
                  onSelect={() => {
                    setSelectedKey(accountKey(account))
                    setKeyword('')
                  }}
                >
                  <img
                    alt={`${account.login}'s avatar`}
                    className="size-6 rounded"
                    src={`https://github.com/${encodeURIComponent(account.login)}.png?size=48`}
                  />
                  <span className="truncate">{account.login}</span>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <a href="/api/github-app/install">Manage GitHub accounts</a>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <a
                  aria-label={`Manage ${selectedAccount.login} GitHub App settings`}
                  className={cn(
                    buttonVariants({ variant: 'outline', size: 'icon' }),
                  )}
                  href={installationUrl(selectedAccount)}
                  rel="noreferrer"
                  target="_blank"
                >
                  <Settings />
                </a>
              </TooltipTrigger>
              <TooltipContent>Manage GitHub App</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </ButtonGroup>
        <div className="relative min-w-0 flex-1">
          {filtering ? (
            <LoaderCircle
              aria-label="Filtering repositories"
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
            />
          ) : (
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 opacity-50" />
          )}
          <Input
            autoComplete="off"
            className="pl-9"
            name="repository-search"
            placeholder="Search repositories by name"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
          />
        </div>
      </div>

      {repositories.isError ? (
        <div className="space-y-2">
          <OperationError
            error={repositories.error}
            fallback="Could not load repositories."
          />
          <Button variant="outline" onClick={() => void repositories.refetch()}>
            Try again
          </Button>
        </div>
      ) : null}
      {!results && repositories.isPending ? (
        <ProjectListSkeleton />
      ) : visibleRepositories.length ? (
        <ul aria-busy={filtering}>
          {visibleRepositories.map((repository) => {
            const destination = repository.defaultBranch
              ? '/$owner/$repo/$branch'
              : '/$owner/$repo'
            const params = {
              owner: repository.owner,
              repo: repository.repo,
              branch: repository.defaultBranch ?? '',
            }
            return (
              <li
                className="flex items-center gap-2 border border-b-0 px-3 py-2 text-sm first:rounded-t-md last:rounded-b-md last:border-b"
                key={`${repository.owner}/${repository.repo}`}
              >
                <img
                  alt={`${repository.owner}'s avatar`}
                  className="size-6 rounded"
                  height="24"
                  loading="lazy"
                  src={`https://github.com/${encodeURIComponent(repository.owner)}.png?size=48`}
                  width="24"
                />
                <Link
                  className="truncate font-medium hover:underline"
                  params={params}
                  to={destination}
                >
                  {repository.repo}
                </Link>
                {repository.private ? (
                  <LockKeyhole className="size-3 shrink-0 opacity-50" />
                ) : null}
                {repository.updatedAt ? (
                  <span className="truncate text-muted-foreground">
                    {relativeTime(repository.updatedAt)}
                  </span>
                ) : null}
                <Button asChild className="ml-auto" size="xs" variant="outline">
                  <Link params={params} to={destination}>
                    Open
                  </Link>
                </Button>
              </li>
            )
          })}
        </ul>
      ) : !repositories.isError ? (
        <div className="rounded-xl border bg-card px-4 py-3 text-center text-sm text-muted-foreground">
          {keyword.trim()
            ? 'No projects matched your search.'
            : 'No projects are available for this account.'}
          {keyword.trim() ? (
            <Button
              size="sm"
              variant="ghost"
              className="ml-2"
              onClick={() => setKeyword('')}
            >
              Reset search
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export function ProjectSelectorSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-label="Loading projects">
      <div className="flex w-full items-center gap-2">
        <Skeleton className="h-9 w-44 rounded-md" />
        <Skeleton className="h-9 flex-1 rounded-md" />
      </div>
      <ProjectListSkeleton />
    </div>
  )
}

function ProjectListSkeleton() {
  return (
    <div aria-label="Loading repositories">
      {[0, 1, 2, 3, 4].map((index) => (
        <div
          className="flex items-center gap-2 border border-b-0 px-3 py-2 last:rounded-b-md last:border-b first:rounded-t-md"
          key={index}
        >
          <Skeleton className="size-6 rounded" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="ml-auto h-6 w-12" />
        </div>
      ))}
    </div>
  )
}
