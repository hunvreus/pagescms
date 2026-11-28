import { useLingui } from '@lingui/react'
import {
  Trans as UiTrans,
  useLingui as useUiMessages,
} from '@lingui/react/macro'
import { HugeiconsIcon } from '@hugeicons/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import ChevronsUpDown from '@hugeicons/core-free-icons/UnfoldMoreIcon'
import LockKeyhole from '@hugeicons/core-free-icons/LockKeyholeIcon'

import { Button } from '#/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { SearchInput } from '#/components/search-input'
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from '#/components/ui/empty'
import {
  RepositorySelectorSkeleton,
  RepositoryListSkeleton,
} from './repository-loading'
import { LoadError } from '#/components/operation-error'
import { searchRepositoryRepositories } from '#/client/api/repository-search'
import { queryKeys } from '#/client/queries/keys'

import { relativeTime } from './relative-time'

import type { RepositoryAccount } from '#/server/repository/repositories'

function useDebouncedValue(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(timeout)
  }, [delay, value])
  return debounced
}

function accountKey(account: RepositoryAccount) {
  return `${account.login}:${account.installationId}`
}

export function initialRepositoryAccount(
  accounts: readonly RepositoryAccount[],
  githubUsername: string | null,
  recentOwner?: string,
): RepositoryAccount | null {
  return (
    accounts.find(
      (account) => account.login.toLowerCase() === recentOwner?.toLowerCase(),
    ) ??
    accounts.find(
      (account) =>
        account.type === 'user' &&
        account.login.toLowerCase() === githubUsername?.toLowerCase(),
    ) ??
    accounts.at(0) ??
    null
  )
}

export function RepositorySelector({
  accounts,
  selectedAccount,
  onAccountSelect,
  canManageRepositories = false,
  email,
  githubConnected = false,
}: {
  accounts: readonly RepositoryAccount[]
  selectedAccount: RepositoryAccount | null
  onAccountSelect: (account: RepositoryAccount) => void
  canManageRepositories?: boolean
  email?: string
  githubConnected?: boolean
}) {
  const { t: _t } = useUiMessages()
  const { i18n: dateI18n } = useLingui()

  const selectedKey = selectedAccount ? accountKey(selectedAccount) : ''
  const [keyword, setKeyword] = useState('')

  const trimmedKeyword = keyword.trim()
  const debouncedKeyword = useDebouncedValue(trimmedKeyword, 500)
  const remoteKeyword =
    selectedAccount?.repositorySelection === 'all' && trimmedKeyword
      ? debouncedKeyword
      : ''
  const searchIsSettling =
    selectedAccount?.repositorySelection === 'all' &&
    trimmedKeyword !== remoteKeyword
  const accountQueryKey = [
    ...queryKeys.repositories(),
    'project-list',
    selectedAccount?.login.toLowerCase(),
    selectedAccount?.installationId,
  ] as const
  const repositories = useQuery({
    queryKey: [...accountQueryKey, remoteKeyword.toLowerCase()],
    queryFn: () =>
      selectedAccount
        ? searchRepositoryRepositories({
            account: selectedAccount,
            keyword: remoteKeyword,
          })
        : Promise.resolve([]),
    enabled: Boolean(selectedAccount),
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    placeholderData: (previousData, previousQuery) =>
      accountQueryKey.every(
        (value, index) => previousQuery?.queryKey[index] === value,
      )
        ? previousData
        : undefined,
  })
  const lastResults = useRef({
    account: selectedKey,
    keyword: remoteKeyword,
    values: repositories.data,
  })
  useEffect(() => {
    if (repositories.isSuccess && !repositories.isPlaceholderData) {
      lastResults.current = {
        account: selectedKey,
        keyword: remoteKeyword,
        values: repositories.data,
      }
    }
  }, [
    repositories.data,
    repositories.isSuccess,
    repositories.isPlaceholderData,
    selectedKey,
    remoteKeyword,
  ])
  const results =
    repositories.data ??
    (lastResults.current.account === selectedKey
      ? lastResults.current.values
      : undefined)
  const filtering =
    searchIsSettling ||
    (repositories.isFetching &&
      lastResults.current.account === selectedKey &&
      lastResults.current.keyword !== remoteKeyword)

  const visibleRepositories = useMemo(() => {
    const values = results ?? []
    if (selectedAccount?.repositorySelection === 'all') return values
    const normalizedKeyword = keyword.trim().toLowerCase()
    if (!normalizedKeyword) return values
    return values.filter((repository) =>
      repository.repo.toLowerCase().includes(normalizedKeyword),
    )
  }, [keyword, results, selectedAccount?.repositorySelection])

  if (!selectedAccount) return <RepositorySelectorSkeleton />

  return (
    <div className="flex flex-col gap-4">
      <div className="flex w-full items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="min-w-32" variant="outline">
              <img
                alt={_t({ message: `${selectedAccount.login}'s avatar` })}
                className="size-5 shrink-0 rounded"
                data-icon="inline-start"
                src={`https://github.com/${encodeURIComponent(selectedAccount.login)}.png?size=48`}
              />
              <span className="max-w-32 truncate">{selectedAccount.login}</span>
              <HugeiconsIcon
                aria-hidden="true"
                icon={ChevronsUpDown}
                className="ml-auto text-muted-foreground"
                data-icon="inline-end"
              />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="w-max min-w-[max(8rem,var(--radix-dropdown-menu-trigger-width))] max-w-[calc(100vw-2rem)]"
          >
            {accounts.map((account) => (
              <DropdownMenuItem
                key={accountKey(account)}
                onSelect={() => {
                  onAccountSelect(account)
                  setKeyword('')
                }}
              >
                <img
                  alt={_t({ message: `${account.login}'s avatar` })}
                  className="size-5 shrink-0 rounded"
                  src={`https://github.com/${encodeURIComponent(account.login)}.png?size=48`}
                />
                <span className="truncate">{account.login}</span>
              </DropdownMenuItem>
            ))}
            {canManageRepositories ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <a href="/api/github-app/install">
                    <UiTrans>Manage accounts</UiTrans>
                  </a>
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
        <SearchInput
          groupClassName="flex-1"
          loading={filtering}
          loadingLabel={_t({ message: 'Filtering repositories' })}
          aria-label={_t({ message: 'Search by name' })}
          disabled={!results && repositories.isPending}
          autoComplete="off"
          name="repository-search"
          placeholder={_t({ message: 'Search by name' })}
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
        />
      </div>

      <LoadError
        error={repositories.error}
        message={_t({ message: 'Could not load repositories.' })}
        stale={Boolean(results)}
        retrying={repositories.isFetching}
        onRetry={() => void repositories.refetch()}
      />
      {(!results && repositories.isPending) ||
      (!visibleRepositories.length && filtering) ? (
        <RepositoryListSkeleton />
      ) : visibleRepositories.length ? (
        <ul aria-busy={filtering} className="rounded-md border px-3">
          {visibleRepositories.map((repository) => {
            const destination = repository.defaultBranch
              ? '/github/$owner/$repo/$branch'
              : '/github/$owner/$repo'
            const params = {
              owner: repository.owner,
              repo: repository.repo,
              branch: repository.defaultBranch ?? '',
            }
            return (
              <li
                className="flex items-center gap-2 border-b py-2 text-sm last:border-b-0"
                key={`${repository.owner}/${repository.repo}`}
              >
                <img
                  alt={_t({ message: `${repository.owner}'s avatar` })}
                  className="size-5 shrink-0 rounded"
                  height="20"
                  loading="lazy"
                  src={`https://github.com/${encodeURIComponent(repository.owner)}.png?size=48`}
                  width="20"
                />
                <Link
                  className="truncate font-medium hover:underline"
                  params={params}
                  to={destination}
                >
                  {repository.repo}
                </Link>
                {repository.private ? (
                  <HugeiconsIcon
                    aria-hidden="true"
                    icon={LockKeyhole}
                    className="size-3 shrink-0 opacity-50"
                  />
                ) : null}
                {repository.updatedAt ? (
                  <span className="truncate text-muted-foreground">
                    {relativeTime(
                      repository.updatedAt,
                      Date.now(),
                      dateI18n.locale,
                    )}
                  </span>
                ) : null}
                <Button asChild className="ml-auto" size="xs" variant="outline">
                  <Link params={params} to={destination}>
                    <UiTrans>Open</UiTrans>
                  </Link>
                </Button>
              </li>
            )
          })}
        </ul>
      ) : !repositories.isError ? (
        <Empty className="border-0 px-0 py-8">
          <EmptyHeader>
            <EmptyTitle>
              {keyword.trim()
                ? _t({ message: 'No matching repositories' })
                : _t({ message: 'No repositories available' })}
            </EmptyTitle>
            <EmptyDescription>
              {keyword.trim()
                ? _t({
                    message:
                      'Try another repository name or clear your search.',
                  })
                : githubConnected
                  ? _t({
                      message: `No repositories are accessible in ${selectedAccount.login}. Choose another account, grant access to an existing repository, or create one from a template.`,
                    })
                  : _t({
                      message: `Ask a project owner to invite ${email ?? _t({ message: 'your signed-in email address' })} to a repository.`,
                    })}
            </EmptyDescription>
          </EmptyHeader>
          {keyword.trim() ? (
            <EmptyContent>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setKeyword('')}
              >
                <UiTrans>Reset search</UiTrans>
              </Button>
            </EmptyContent>
          ) : canManageRepositories ? (
            <EmptyContent>
              <Button asChild size="sm">
                <a href="/api/github-app/install">
                  <UiTrans>Manage repository access</UiTrans>
                </a>
              </Button>
            </EmptyContent>
          ) : null}
        </Empty>
      ) : null}
    </div>
  )
}
