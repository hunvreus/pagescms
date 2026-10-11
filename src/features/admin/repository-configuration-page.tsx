import { useCallback, useRef, useState } from 'react'
import { getRouteApi, useBlocker } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '#/components/ui/alert-dialog'
import { repositoryWorkspaceQueryOptions } from '#/queries/repository'
import { ConfigurationPage } from './configuration-page'

const route = getRouteApi('/$owner/$repo/$branch/configuration')
export function RepositoryConfigurationPage() {
  const params = route.useParams()
  const { data: workspace } = useSuspenseQuery(
    repositoryWorkspaceQueryOptions(params),
  )
  const [dirty, setDirty] = useState(false)
  const dirtyRef = useRef(false)
  const updateDirty = useCallback((next: boolean) => {
    dirtyRef.current = next
    setDirty(next)
  }, [])
  const blocker = useBlocker({
    shouldBlockFn: () => dirtyRef.current,
    withResolver: true,
    enableBeforeUnload: dirty,
  })
  return (
    <>
      <ConfigurationPage
        key={`${params.owner}/${params.repo}/${params.branch}`}
        {...params}
        showGitHubLink={workspace.canViewGitHub}
        onDirtyChange={updateDirty}
      />
      <AlertDialog open={blocker.status === 'blocked'}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard configuration changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Your unsaved changes will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => blocker.reset?.()}>
              Keep editing
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                updateDirty(false)
                blocker.proceed?.()
              }}
            >
              Discard changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
