import { useEffect, useMemo, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ExternalLink, FolderGit2, LockKeyhole, Search } from 'lucide-react'

import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { OperationError } from '#/components/operation-error'
import { getProjectRepositories } from '#/functions/projects'
import { queryKeys } from '#/queries/keys'

import type { ProjectAccount } from '#/server/projects.server'

function useDebouncedValue(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(timeout)
  }, [delay, value])
  return debounced
}

function updatedLabel(value: string | null) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
  }).format(date)
}

export function ProjectSelector({
  accounts,
  githubAppInstallAvailable,
}: {
  accounts: readonly ProjectAccount[]
  githubAppInstallAvailable: boolean
}) {
  const [selectedKey, setSelectedKey] = useState(() =>
    accounts[0] ? `${accounts[0].login}:${accounts[0].installationId}` : '',
  )
  const [keyword, setKeyword] = useState('')
  const selectedAccount = accounts.find(
    (account) => `${account.login}:${account.installationId}` === selectedKey,
  )
  useEffect(() => {
    if (!selectedAccount && accounts[0]) {
      setSelectedKey(`${accounts[0].login}:${accounts[0].installationId}`)
    }
  }, [accounts, selectedAccount])
  const debouncedKeyword = useDebouncedValue(keyword.trim(), 300)
  const remoteKeyword =
    selectedAccount?.repositorySelection === 'all' ? debouncedKeyword : ''

  const repositories = useQuery({
    queryKey: [
      ...queryKeys.repositories(),
      'project-list',
      selectedAccount?.login.toLowerCase(),
      selectedAccount?.installationId,
      remoteKeyword.toLowerCase(),
    ],
    queryFn: () => {
      if (!selectedAccount) return Promise.resolve([])
      return getProjectRepositories({
        data: { account: selectedAccount, keyword: remoteKeyword },
      })
    },
    enabled: Boolean(selectedAccount),
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    placeholderData: keepPreviousData,
  })

  const visibleRepositories = useMemo(() => {
    const values = repositories.data ?? []
    if (selectedAccount?.repositorySelection === 'all') return values
    const normalizedKeyword = keyword.trim().toLowerCase()
    if (!normalizedKeyword) return values
    return values.filter((repository) =>
      repository.repo.toLowerCase().includes(normalizedKeyword),
    )
  }, [keyword, repositories.data, selectedAccount?.repositorySelection])

  if (!selectedAccount) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center shadow-xs">
        <div className="mx-auto mb-4 flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <FolderGit2 className="size-5" aria-hidden="true" />
        </div>
        <h2 className="font-medium">No repositories yet</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
          Install the GitHub App or ask a repository owner to invite this email
          address.
        </p>
        {githubAppInstallAvailable ? (
          <Button asChild className="mt-4">
            <a href="/api/github-app/install">
              Install GitHub App <ExternalLink />
            </a>
          </Button>
        ) : null}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <select
          aria-label="GitHub account"
          className="h-9 rounded-lg border bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          value={selectedKey}
          onChange={(event) => {
            setSelectedKey(event.target.value)
            setKeyword('')
          }}
        >
          {accounts.map((account) => (
            <option
              key={`${account.login}:${account.installationId}`}
              value={`${account.login}:${account.installationId}`}
            >
              {account.login}
            </option>
          ))}
        </select>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search repositories by name"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
          />
        </div>
      </div>

      {repositories.isPending ? (
        <ProjectListSkeleton />
      ) : repositories.isError ? (
        <div className="space-y-2">
          <OperationError
            error={repositories.error}
            fallback="Could not load repositories."
          />
          <Button variant="outline" onClick={() => void repositories.refetch()}>
            Try again
          </Button>
        </div>
      ) : visibleRepositories.length ? (
        <ul className="overflow-hidden rounded-xl border bg-card shadow-xs">
          {visibleRepositories.map((repository) => {
            const params = {
              owner: repository.owner,
              repo: repository.repo,
              branch: repository.defaultBranch ?? '',
            }
            const projectLink = (children: React.ReactNode) =>
              repository.defaultBranch ? (
                <Link params={params} to="/$owner/$repo/$branch">
                  {children}
                </Link>
              ) : (
                <Link params={params} to="/$owner/$repo">
                  {children}
                </Link>
              )
            return (
              <li
                key={`${repository.owner}/${repository.repo}`}
                className="flex items-center gap-3 border-b px-4 py-3 last:border-b-0"
              >
                <img
                  alt=""
                  className="size-7 rounded-md bg-muted"
                  height="28"
                  loading="lazy"
                  src={`https://github.com/${encodeURIComponent(repository.owner)}.png?size=56`}
                  width="28"
                />
                <div className="min-w-0 flex-1">
                  {projectLink(
                    <span className="inline-flex max-w-full items-center gap-1.5 font-medium hover:underline">
                      <span className="truncate">{repository.repo}</span>
                      {repository.private ? (
                        <LockKeyhole className="size-3 text-muted-foreground" />
                      ) : null}
                    </span>,
                  )}
                  <p className="text-xs text-muted-foreground">
                    {repository.owner}
                    {updatedLabel(repository.updatedAt)
                      ? ` · Updated ${updatedLabel(repository.updatedAt)}`
                      : ''}
                  </p>
                </div>
                <Button asChild size="sm" variant="outline">
                  {projectLink(<span>Open</span>)}
                </Button>
              </li>
            )
          })}
        </ul>
      ) : (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground shadow-xs">
          No projects matched your search.
        </div>
      )}
    </div>
  )
}

function ProjectListSkeleton() {
  return (
    <div
      className="overflow-hidden rounded-xl border bg-card"
      aria-label="Loading repositories"
    >
      {[0, 1, 2, 3].map((index) => (
        <div
          className="flex animate-pulse items-center gap-3 border-b px-4 py-3 last:border-b-0"
          key={index}
        >
          <div className="size-7 rounded-md bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-32 rounded bg-muted" />
            <div className="h-3 w-24 rounded bg-muted" />
          </div>
          <div className="h-7 w-14 rounded bg-muted" />
        </div>
      ))}
    </div>
  )
}
