import {
  operationKey,
  refreshQueries,
  useOperation,
} from '#/features/operations/use-operation'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '#/components/ui/dialog'
import { Field, FieldLabel } from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import { OperationError } from '#/components/operation-error'
import { createRepositoryBranch } from '#/functions/repository'
import { queryKeys } from '#/queries/keys'
import { repositoryBranchesQueryOptions } from '#/queries/repository'
import { canCreateBranch } from './branch-picker'

export function CreateBranchDialog({
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
  const [name, setName] = useState('')
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const openRef = useRef(open)
  openRef.current = open
  const operation = useOperation<
    Awaited<ReturnType<typeof createRepositoryBranch>>
  >(operationKey('branch-create', { owner, repo }))
  const creating = operation.pending
  const [error, setError] = useState<unknown>(null)
  const router = useRouter()
  const queryClient = useQueryClient()
  const query = useQuery({
    ...repositoryBranchesQueryOptions({ owner, repo, branch }),
    enabled: open,
  })
  const valid = !!query.data && !creating && canCreateBranch(name, query.data)
  function changeOpen(next: boolean) {
    onOpenChange(next)
    if (!next) {
      setName('')
      setError(null)
    }
  }
  async function create() {
    if (!valid) return
    const origin = router.state.location.href
    setError(null)
    try {
      await operation.run({
        failureMessage: 'Could not create the branch.',
        run: () =>
          createRepositoryBranch({
            data: { owner, repo, branch: name.trim(), source: branch },
          }),
        confirmed: async (result, active) => {
          if (!active()) return
          const { toast } = await import('sonner')
          if (!active()) return
          toast.success(`Branch “${result.branch}” created`)
          refreshQueries(queryClient, [queryKeys.repository({ owner, repo })])
          for (const [key, branches] of queryClient.getQueriesData<string[]>({
            queryKey: queryKeys.repository({ owner, repo }),
          })) {
            if (
              key.at(-1) === 'branches' &&
              branches &&
              !branches.includes(result.branch)
            )
              queryClient.setQueryData(key, [...branches, result.branch])
          }
          if (
            !mounted.current ||
            !openRef.current ||
            router.state.location.href !== origin
          )
            return
          onOpenChange(false)
          setName('')
          await router.navigate({
            to: '/$owner/$repo/$branch',
            params: { owner, repo, branch: result.branch },
          })
        },
      })
    } catch (cause) {
      setError(cause)
    }
  }
  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create branch</DialogTitle>
          <DialogDescription>
            Create a branch from “{branch}”.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            void create()
          }}
        >
          <Field>
            <FieldLabel htmlFor="new-branch-name">Branch name</FieldLabel>
            <Input
              id="new-branch-name"
              autoFocus
              value={name}
              disabled={creating}
              onChange={(event) => setName(event.target.value)}
              placeholder="feature/new-branch"
            />
          </Field>
          <OperationError
            error={error ?? operation.error ?? query.error}
            fallback="Could not load or create branches."
          />
          <DialogFooter>
            <Button
              variant="outline"
              type="button"
              onClick={() => changeOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!valid}>
              {creating ? 'Creating…' : 'Create branch'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
