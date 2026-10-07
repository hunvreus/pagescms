import { useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { GitBranch, LoaderCircle, Plus } from 'lucide-react'
import { OperationError } from '#/components/operation-error'
import {
  Command,
  CommandDialog,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '#/components/ui/command'
import { Skeleton } from '#/components/ui/skeleton'
import { createRepositoryBranch } from '#/functions/repository'
import { queryKeys } from '#/queries/keys'
import { repositoryBranchesQueryOptions } from '#/queries/repository'
import { canCreateBranch } from './branch-picker'

export function BranchManager({
  open,
  onOpenChange,
  owner,
  repo,
  branch,
  canCreate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  owner: string
  repo: string
  branch: string
  canCreate: boolean
}) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const query = useQuery({
    ...repositoryBranchesQueryOptions({ owner, repo, branch }),
    enabled: open,
  })
  const branches = query.data ?? []
  const filtered = branches.filter((value) =>
    value.toLowerCase().includes(search.toLowerCase()),
  )
  const canSubmit =
    !!query.data && !creating && canCreateBranch(search, branches)

  async function create() {
    if (!canCreate || !canSubmit) return
    setCreating(true)
    setError(null)
    try {
      const result = await createRepositoryBranch({
        data: { owner, repo, branch: search.trim(), source: branch },
      })
      await queryClient.invalidateQueries({
        queryKey: queryKeys.repository({ owner, repo }),
      })
      onOpenChange(false)
      await router.navigate({
        to: '/$owner/$repo/$branch',
        params: { owner, repo, branch: result.branch },
      })
    } catch (cause) {
      setError(cause)
    } finally {
      setCreating(false)
    }
  }

  return (
    <CommandDialog
      title="Manage branches"
      description={
        canCreate
          ? `Switch branches or create a new branch from ${branch}.`
          : 'Search and switch branches.'
      }
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) {
          setSearch('')
          setError(null)
        }
      }}
    >
      <OperationError
        error={error ?? query.error}
        fallback="Could not load or create branches."
      />
      <Command shouldFilter={false}>
        <CommandInput
          aria-label="Search branches"
          placeholder="Search branches or enter a new name"
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
                  disabled={creating}
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
          {canCreate ? (
            <>
              {filtered.length ? <CommandSeparator /> : null}
              <CommandGroup>
                <CommandItem
                  value="create-branch"
                  disabled={!canSubmit}
                  onSelect={() => void create()}
                >
                  {creating ? (
                    <LoaderCircle className="animate-spin" />
                  ) : (
                    <Plus />
                  )}
                  <span className="truncate">
                    {search.trim()
                      ? `Create branch “${search.trim()}”`
                      : 'Create branch'}
                  </span>
                </CommandItem>
              </CommandGroup>
            </>
          ) : null}
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
