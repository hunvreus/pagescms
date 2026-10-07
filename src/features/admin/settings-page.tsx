import { lazy, Suspense, useCallback, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { CatchBoundary, getRouteApi, useBlocker } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { OperationError } from '#/components/operation-error'
import {
  RepositoryPageHeader,
  RepositoryPageTitle,
} from '#/components/repository-page-header'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
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
import { Skeleton } from '#/components/ui/skeleton'
import { isConfigurationEditingEnabled } from '#/lib/configuration'
import { resourceTypeVisible } from '#/components/repository-workspace'
import { repositoryWorkspaceQueryOptions } from '#/queries/repository'
import { ActionsEmpty } from './actions-empty'
import { RepositoryAdminPage } from './repository-admin-page'
import { ActionsPage } from './actions-page'
import { CachePage } from './cache-page'
import { CollaboratorsPage } from './collaborators-page'
import { CollaboratorsSkeleton } from './collaborators-skeleton'
import { ConfigurationSkeleton } from './configuration-skeleton'
import { ActionRunsSkeleton } from './action-runs-skeleton'

const ConfigurationPage = lazy(() =>
  import('./configuration-page').then((module) => ({
    default: module.ConfigurationPage,
  })),
)
const route = getRouteApi('/$owner/$repo/$branch/settings')

export function SettingsPage() {
  const params = route.useParams()
  const search = route.useSearch()
  const navigate = route.useNavigate()
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
  const configuration = workspace.configuration?.object ?? {}
  const manager = workspace.canViewGitHub
  const canConfigure = manager && isConfigurationEditingEnabled(configuration)
  const showActions =
    manager && resourceTypeVisible(workspace.discovery, 'action')
  const canViewRuns = showActions && Boolean(workspace.configuration)
  const dialog = search.dialog === 'runs' && canViewRuns ? 'runs' : undefined

  return (
    <div className="-m-4 md:-m-6">
      <RepositoryPageHeader>
        <RepositoryPageTitle>Settings</RepositoryPageTitle>
      </RepositoryPageHeader>
      <div
        data-slot="settings-content"
        className="mx-auto w-full max-w-[808px] space-y-10 px-4 py-6 md:px-6 md:py-8"
      >
        {canConfigure ? (
          <SettingsSection
            key={`${params.owner}/${params.repo}/${params.branch}/configuration`}
            fallback={<ConfigurationSkeleton />}
          >
            <ConfigurationPage
              {...params}
              embedded
              inline
              editing={search.edit === 'configuration'}
              showGitHubLink={workspace.canViewGitHub}
              onDirtyChange={updateDirty}
              onEdit={() =>
                void navigate({ search: { edit: 'configuration' } })
              }
              onCancel={() => void navigate({ search: {} })}
              onDone={() => {
                updateDirty(false)
                void navigate({ search: {} })
              }}
            />
          </SettingsSection>
        ) : null}
        {manager ? (
          <SettingsSection
            key={`${params.owner}/${params.repo}/${params.branch}/collaborators`}
            fallback={<CollaboratorsSkeleton />}
          >
            <CollaboratorsPage {...params} embedded />
          </SettingsSection>
        ) : null}
        {showActions ? (
          <SettingsSection
            key={`${params.owner}/${params.repo}/${params.branch}/actions`}
          >
            {workspace.configuration ? (
              <ActionsPage
                {...params}
                embedded
                onViewRuns={(action) =>
                  void navigate({ search: { dialog: 'runs', action } })
                }
              />
            ) : (
              <RepositoryAdminPage title="Actions" embedded>
                <ActionsEmpty />
              </RepositoryAdminPage>
            )}
          </SettingsSection>
        ) : null}
        {manager && workspace.repository.canPush ? (
          <SettingsSection
            key={`${params.owner}/${params.repo}/${params.branch}/cache`}
          >
            <CachePage {...params} embedded />
          </SettingsSection>
        ) : null}
      </div>
      <Dialog
        open={dialog !== undefined}
        onOpenChange={(open) => {
          if (!open) void navigate({ search: {} })
        }}
      >
        <DialogContent className="h-[min(40rem,90dvh)] grid-rows-[auto_minmax(0,1fr)] overflow-hidden sm:max-w-4xl">
          <DialogHeader className="pr-8">
            <DialogTitle>Action runs</DialogTitle>
            <DialogDescription>
              Inspect recent workflow runs and open their logs on GitHub.
            </DialogDescription>
          </DialogHeader>
          <div
            data-slot="dialog-scroll-body"
            className="scrollbar min-h-0 overflow-auto [scrollbar-gutter:stable]"
          >
            <CatchBoundary
              getResetKey={() => `${dialog}:${search.action}`}
              errorComponent={({ error, reset }) => (
                <div className="space-y-3">
                  <OperationError
                    error={error}
                    fallback="Could not load settings."
                  />
                  <Button onClick={reset}>Try again</Button>
                </div>
              )}
            >
              <Suspense fallback={<ActionRunsSkeleton />}>
                {dialog === 'runs' ? (
                  <ActionsPage
                    {...params}
                    embedded
                    runsOnly
                    actionName={search.action}
                    onActionFilter={(action) =>
                      void navigate({
                        search: { ...search, dialog: 'runs', action },
                      })
                    }
                  />
                ) : null}
              </Suspense>
            </CatchBoundary>
          </div>
        </DialogContent>
      </Dialog>
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
    </div>
  )
}

function SettingsSection({
  children,
  fallback,
}: {
  children: ReactNode
  fallback?: ReactNode
}) {
  return (
    <CatchBoundary
      getResetKey={() => 'settings'}
      errorComponent={({ error, reset }) => (
        <div className="space-y-3">
          <OperationError error={error} fallback="Could not load settings." />
          <Button size="sm" onClick={reset}>
            Try again
          </Button>
        </div>
      )}
    >
      <Suspense
        fallback={
          fallback ?? (
            <Skeleton
              aria-label="Loading settings section"
              className="h-24 w-full"
            />
          )
        }
      >
        {children}
      </Suspense>
    </CatchBoundary>
  )
}
