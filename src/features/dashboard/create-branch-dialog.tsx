import {
  Trans as UiTrans,
  useLingui as useUiMessages,
} from '@lingui/react/macro'
import { Spinner } from '#/components/ui/spinner'
import {
  operationKey,
  refreshQueries,
  useOperation,
} from '#/features/pending-writes/use-operation'
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
import { LoadError } from '#/components/operation-error'
import { createRepositoryBranch } from '#/client/api/repository'
import { queryKeys } from '#/client/queries/keys'
import {
  repositoryBranchesQueryOptions,
  repositoryQueryOptions,
} from '#/client/queries/repository'
import { canCreateBranch } from './branch-picker'

export function CreateBranchDialog({
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

  const params = { owner, repo, branch, repoId }
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
  >(operationKey('branch-create', params))
  const creating = operation.pending
  const router = useRouter()
  const queryClient = useQueryClient()
  const query = useQuery({
    ...repositoryBranchesQueryOptions(params),
    enabled: open,
  })
  const valid = !!query.data && !creating && canCreateBranch(name, query.data)
  function changeOpen(next: boolean) {
    onOpenChange(next)
    if (!next) {
      setName('')
    }
  }
  async function create() {
    if (!valid) return
    const origin = router.state.location.href
    try {
      await operation.run({
        failureMessage: _t({ message: 'Could not create the branch.' }),
        successMessage: (result) => `Branch “${result.branch}” created`,
        run: () =>
          createRepositoryBranch({
            ...params,
            branch: name.trim(),
            source: branch,
          }),
        confirmed: async (result, active) => {
          if (!active()) return
          if (!active()) return
          refreshQueries(queryClient, [queryKeys.repository(params)])
          refreshQueries(queryClient, [repositoryQueryOptions(params).queryKey])
          for (const [key, branches] of queryClient.getQueriesData<string[]>({
            queryKey: queryKeys.repository(params),
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
            to: '/github/$owner/$repo/$branch',
            params: { owner, repo, branch: result.branch },
          })
        },
      })
    } catch {
      // The operation boundary reports this failure.
    }
  }
  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <UiTrans>Create branch</UiTrans>
          </DialogTitle>
          <DialogDescription>
            <UiTrans>Create a branch from “</UiTrans>
            {branch}”.
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
            <FieldLabel htmlFor="new-branch-name">
              <UiTrans>Branch name</UiTrans>
            </FieldLabel>
            <Input
              id="new-branch-name"
              autoFocus
              value={name}
              disabled={creating}
              onChange={(event) => setName(event.target.value)}
              placeholder={_t({ message: 'feature/new-branch' })}
            />
          </Field>
          <LoadError
            error={query.error}
            message={_t({ message: 'Could not load branches.' })}
            stale={Boolean(query.data)}
            retrying={query.isFetching}
            onRetry={() => void query.refetch()}
          />
          <DialogFooter>
            <Button
              variant="outline"
              type="button"
              onClick={() => changeOpen(false)}
            >
              <UiTrans>Cancel</UiTrans>
            </Button>
            <Button aria-busy={creating} type="submit" disabled={!valid}>
              <UiTrans>Create branch</UiTrans>
              {creating ? (
                <Spinner aria-hidden="true" data-icon="inline-end" />
              ) : null}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
