import {
  Trans as UiTrans,
  useLingui as useUiMessages,
} from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { TooltipProvider } from '#/components/ui/tooltip'
import {
  RepositoryPageHeader,
  RepositoryPageTitle,
} from '#/components/repository-page-header'
import { OperationError } from '#/components/operation-error'
import { ActivityFeed } from '#/features/activity/activity-feed'
import { authenticationQueryOptions } from '#/client/queries/session'
import { repositoryQueryOptions } from '#/client/queries/repository'
import { getConfigurationNavigation } from '#/shared/configuration-navigation'
import { OverviewShortcuts } from './overview-shortcuts'
import { OverviewLocalFiles } from './overview-local-files'
import { useOverviewFiles } from './use-overview-files'

export function RepositoryOverview({
  coordinates,
}: {
  coordinates: { owner: string; repo: string; branch: string }
}) {
  const { t: _t } = useUiMessages()

  const { data: auth } = useQuery(authenticationQueryOptions())
  const { data: workspace } = useQuery(repositoryQueryOptions(coordinates))
  const account = auth?.user?.id
  const local = useOverviewFiles(account, workspace?.source, coordinates)
  const configuration = workspace?.configuration?.object
  const navigation = configuration
    ? getConfigurationNavigation(configuration)
    : []
  const scope = JSON.stringify([account, workspace?.source, coordinates])

  return (
    <div className="-m-4 md:-m-6">
      <RepositoryPageHeader>
        <RepositoryPageTitle>
          <UiTrans>Overview</UiTrans>
        </RepositoryPageTitle>
      </RepositoryPageHeader>
      <TooltipProvider>
        <div className="mx-auto max-w-3xl space-y-8 p-4 md:p-6">
          <OperationError
            error={local.error}
            onRetry={() => void local.refetch()}
            retrying={local.isFetching}
            fallback={_t({
              message:
                'Local drafts could not be loaded. Keep any open editor tabs until you can save.',
            })}
          />
          {configuration ? (
            <OverviewShortcuts
              configuration={configuration}
              coordinates={coordinates}
              runnableActions={workspace.runnableRepositoryActions}
            />
          ) : null}
          <ActivityFeed
            key={scope}
            account={account}
            coordinates={coordinates}
            resources={navigation}
            hideWhenEmpty={!configuration}
          />
          {configuration ? (
            <section
              aria-label={_t({ message: 'Recently visited and drafts' })}
            >
              <OverviewLocalFiles
                key={scope}
                configuration={configuration}
                resources={navigation}
                visits={local.data?.visits ?? []}
                drafts={local.data?.drafts ?? []}
                loading={local.isPending}
                failed={local.isError}
              />
            </section>
          ) : null}
        </div>
      </TooltipProvider>
    </div>
  )
}
