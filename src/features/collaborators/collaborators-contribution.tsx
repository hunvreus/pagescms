import { useSuspenseQuery } from '@tanstack/react-query'
import { authenticationQueryOptions } from '#/client/queries/session'
import { RepositoryAdminHeaderActions } from '#/features/admin/repository-admin-page'
import { lazy, Suspense } from 'react'
import clientDeployment from '#pagescms/deployment/client'

import { CollaboratorsLoading } from '#/components/collaborators-loading'

import type { QueryClient } from '@tanstack/react-query'
import type { RepositoryPageProps } from '#/plugins/client'

const loadContribution = clientDeployment.ui.repositoryCollaborators
export const hasRepositoryCollaborators = Boolean(loadContribution)
// Start loading the replacement with the route module, not after hydration.
// Importing UI code grants no repository access; its API still authorizes reads.
const browserContribution = loadContribution?.()
void browserContribution?.catch(() => {})
const RepositoryCollaborators = loadContribution
  ? lazy(() => browserContribution ?? loadContribution())
  : null

// Core only selects and renders the replacement; it owns no data for it.
export function RepositoryCollaboratorsContribution(
  props: Omit<RepositoryPageProps, 'HeaderActions' | 'accountId'>,
) {
  const { data: session } = useSuspenseQuery(authenticationQueryOptions())
  if (!RepositoryCollaborators || !session.user) return null
  return (
    <Suspense
      fallback={
        <CollaboratorsLoading HeaderActions={RepositoryAdminHeaderActions} />
      }
    >
      <RepositoryCollaborators
        key={`${session.user.id}:${props.repoId ?? `${props.owner}/${props.repo}`}:${props.branch}`}
        {...props}
        accountId={session.user.id}
        HeaderActions={RepositoryAdminHeaderActions}
      />
    </Suspense>
  )
}

export async function preloadRepositoryCollaborators(
  props: Omit<RepositoryPageProps, 'HeaderActions' | 'accountId'>,
  queryClient: QueryClient,
) {
  // Relative plugin API requests run in the browser, never during SSR.
  if (!loadContribution) return
  const [module, session] = await Promise.all([
    browserContribution ?? loadContribution(),
    queryClient.ensureQueryData(authenticationQueryOptions()),
  ])
  if (session.user)
    await module.preload?.(
      { ...props, accountId: session.user.id },
      queryClient,
    )
}
