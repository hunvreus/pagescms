import { useRouteRetry } from '#/hooks/use-route-retry'
import { Spinner } from '#/components/ui/spinner'
import { RepositoryHeaderNavigation } from '#/components/repository-page-header'
import { useContext } from 'react'
import type { ReactNode } from 'react'
import { Link, useParams, useRouter } from '@tanstack/react-router'
import { Trans as UiTrans } from '@lingui/react/macro'
import { Button } from '#/components/ui/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '#/components/ui/empty'
import type { ErrorComponentProps } from '@tanstack/react-router'

function OverviewLink({ retry }: { retry?: () => Promise<void> }) {
  const router = useRouter()
  const { owner, repo, branch } = useParams({ strict: false })
  return (
    <Button asChild size="sm" variant="outline">
      <Link
        to="/github/$owner/$repo/$branch"
        params={{ owner: owner!, repo: repo!, branch: branch! }}
        onClick={(event) => {
          if (
            retry &&
            router.state.matches.at(-1)?.routeId ===
              '/github/$owner/$repo/$branch/'
          ) {
            event.preventDefault()
            void retry()
          }
        }}
      >
        <UiTrans>Go to overview</UiTrans>
      </Link>
    </Button>
  )
}
function RepositoryRouteState({ children }: { children: ReactNode }) {
  const navigation = useContext(RepositoryHeaderNavigation)
  return (
    <div
      className="relative -m-4 flex min-h-svh items-center justify-center p-4 md:-m-6 md:p-6"
      data-slot="project-route-state"
    >
      {navigation ? (
        <div className="absolute left-4 top-4 md:hidden">{navigation}</div>
      ) : null}
      {children}
    </div>
  )
}
export function RepositoryNotFound() {
  return (
    <RepositoryRouteState>
      <Empty className="max-w-sm">
        <EmptyHeader>
          <EmptyTitle>
            <UiTrans>Page not found</UiTrans>
          </EmptyTitle>
          <EmptyDescription>
            <UiTrans>
              This page does not exist in this project. It may have been removed
              or renamed.
            </UiTrans>
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <OverviewLink />
        </EmptyContent>
      </Empty>
    </RepositoryRouteState>
  )
}
export function RepositoryError({ reset }: ErrorComponentProps) {
  const { retry, retrying } = useRouteRetry(reset)
  return (
    <RepositoryRouteState>
      <Empty className="max-w-sm">
        <EmptyHeader>
          <EmptyTitle>
            <UiTrans>Something went wrong</UiTrans>
          </EmptyTitle>
          <EmptyDescription>
            <UiTrans>
              We couldn’t load this project page. Try again or return to its
              overview.
            </UiTrans>
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => void retry()}
              disabled={retrying}
              aria-busy={retrying}
            >
              <UiTrans>Try again</UiTrans>
              {retrying ? <Spinner /> : null}
            </Button>
            <OverviewLink retry={retry} />
          </div>
        </EmptyContent>
      </Empty>
    </RepositoryRouteState>
  )
}

export function RepositoryAccessDenied() {
  return (
    <RepositoryRouteState>
      <Empty className="max-w-sm">
        <EmptyHeader>
          <EmptyTitle>
            <UiTrans>Access denied</UiTrans>
          </EmptyTitle>
          <EmptyDescription>
            <UiTrans>You do not have permission to do this.</UiTrans>
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <OverviewLink />
        </EmptyContent>
      </Empty>
    </RepositoryRouteState>
  )
}
