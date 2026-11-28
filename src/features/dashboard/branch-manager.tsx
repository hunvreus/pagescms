import {
  Trans as UiTrans,
  useLingui as useUiMessages,
} from '@lingui/react/macro'
import { HugeiconsIcon } from '@hugeicons/react'
import { useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import GitBranch from '@hugeicons/core-free-icons/GitBranchIcon'
import { LoadError } from '#/components/operation-error'
import {
  Command,
  CommandDialog,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '#/components/ui/command'
import { Skeleton } from '#/components/ui/skeleton'
import { repositoryBranchesQueryOptions } from '#/client/queries/repository'

export function BranchManager({
  open,
  onOpenChange,
  owner,
  repo,
  branch,
  repoId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  owner: string
  repo: string
  branch: string
  repoId?: string
}) {
  const { t: _t } = useUiMessages()

  const router = useRouter()
  const [search, setSearch] = useState('')
  const query = useQuery({
    ...repositoryBranchesQueryOptions({ owner, repo, branch, repoId }),
    enabled: open,
  })
  const branches = query.data ?? []
  const filtered = branches.filter((value) =>
    value.toLowerCase().includes(search.toLowerCase()),
  )
  return (
    <CommandDialog
      title={_t({ message: 'All branches' })}
      description={_t({ message: 'Search and switch branches.' })}
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) {
          setSearch('')
        }
      }}
    >
      <LoadError
        error={query.error}
        message={_t({ message: 'Could not load branches.' })}
        stale={Boolean(query.data)}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
      <Command shouldFilter={false}>
        <CommandInput
          aria-label={_t({ message: 'Search branches' })}
          placeholder={_t({ message: 'Search branches…' })}
          value={search}
          onValueChange={setSearch}
        />
        <CommandList aria-label={_t({ message: 'Branches' })}>
          {query.isLoading ? (
            <div
              role="status"
              aria-label={_t({ message: 'Loading branches' })}
              className="space-y-2 p-2"
            >
              {[0, 1, 2].map((value) => (
                <div key={value} className="flex h-8 items-center gap-2 px-2">
                  <Skeleton className="size-4" />
                  <Skeleton className="h-4 w-32" />
                </div>
              ))}
            </div>
          ) : filtered.length ? (
            <CommandGroup>
              {filtered.map((value) => (
                <CommandItem
                  key={value}
                  value={`branch:${value}`}
                  data-checked={value === branch}
                  onSelect={() => {
                    onOpenChange(false)
                    void router.navigate({
                      to: '/github/$owner/$repo/$branch',
                      params: { owner, repo, branch: value },
                    })
                  }}
                >
                  <HugeiconsIcon aria-hidden="true" icon={GitBranch} />
                  <span className="truncate">{value}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : !query.isError ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              <UiTrans>No branches found.</UiTrans>
            </p>
          ) : null}
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
