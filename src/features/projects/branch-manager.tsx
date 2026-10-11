import { useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { GitBranch } from 'lucide-react'
import { OperationError } from '#/components/operation-error'
import {
  Command,
  CommandDialog,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '#/components/ui/command'
import { Skeleton } from '#/components/ui/skeleton'
import { repositoryBranchesQueryOptions } from '#/queries/repository'

export function BranchManager({
  open,
  onOpenChange,
  owner,
  repo,
  branch,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  owner: string
  repo: string
  branch: string
}) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const query = useQuery({
    ...repositoryBranchesQueryOptions({ owner, repo, branch }),
    enabled: open,
  })
  const branches = query.data ?? []
  const filtered = branches.filter((value) =>
    value.toLowerCase().includes(search.toLowerCase()),
  )
  return (
    <CommandDialog
      title="All branches"
      description="Search and switch branches."
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) {
          setSearch('')
        }
      }}
    >
      <OperationError error={query.error} fallback="Could not load branches." />
      <Command shouldFilter={false}>
        <CommandInput
          aria-label="Search branches"
          placeholder="Search branches…"
          value={search}
          onValueChange={setSearch}
        />
        <CommandList aria-label="Branches">
          {query.isLoading ? (
            <div
              role="status"
              aria-label="Loading branches"
              className="space-y-2 p-2"
            >
              {[0, 1, 2].map((value) => (
                <Skeleton key={value} className="h-8 w-full" />
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
                      to: '/$owner/$repo/$branch',
                      params: { owner, repo, branch: value },
                    })
                  }}
                >
                  <GitBranch />
                  <span className="truncate">{value}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : !query.isError ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No branches found.
            </p>
          ) : null}
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
