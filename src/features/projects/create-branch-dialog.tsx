import { useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { LoaderCircle } from 'lucide-react'
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
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const router = useRouter()
  const queryClient = useQueryClient()
  const query = useQuery({
    ...repositoryBranchesQueryOptions({ owner, repo, branch }),
    enabled: open,
  })
  const valid = !!query.data && !creating && canCreateBranch(name, query.data)
  function changeOpen(next: boolean) {
    if (creating) return
    onOpenChange(next)
    if (!next) {
      setName('')
      setError(null)
    }
  }
  async function create() {
    if (!valid) return
    setCreating(true)
    setError(null)
    try {
      const result = await createRepositoryBranch({
        data: { owner, repo, branch: name.trim(), source: branch },
      })
      const { toast } = await import('sonner')
      toast.success(`Branch “${result.branch}” created`)
      await queryClient.invalidateQueries({
        queryKey: queryKeys.repository({ owner, repo }),
      })
      onOpenChange(false)
      setName('')
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
            error={error ?? query.error}
            fallback="Could not load or create branches."
          />
          <DialogFooter>
            <Button
              variant="outline"
              type="button"
              disabled={creating}
              onClick={() => changeOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!valid}>
              {creating ? <LoaderCircle className="animate-spin" /> : null}
              {creating ? 'Creating…' : 'Create branch'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
