import {
  Trans as UiTrans,
  useLingui as useUiMessages,
} from '@lingui/react/macro'
import { Link } from '@tanstack/react-router'

import { Button } from '#/components/ui/button'
import {
  RepositoryPageHeader,
  RepositoryPageTitle,
} from '#/components/repository-page-header'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '#/components/ui/empty'

export function ConfigurationRequired({
  coordinates,
  canConfigure,
  title = 'Overview',
  invalid = false,
}: {
  coordinates: { owner: string; repo: string; branch: string }
  canConfigure: boolean
  invalid?: boolean
  title?: string
}) {
  const { t: _t } = useUiMessages()

  return (
    <div className="-m-4 md:-m-6">
      <RepositoryPageHeader>
        <RepositoryPageTitle>{title}</RepositoryPageTitle>
      </RepositoryPageHeader>
      <Empty
        aria-label={_t({ message: 'Repository setup' })}
        role="region"
        className="min-h-[calc(100svh-8rem)]"
      >
        <EmptyHeader>
          <EmptyTitle>
            {invalid
              ? _t({ message: 'Configuration needs fixing' })
              : _t({ message: 'No configuration yet' })}
          </EmptyTitle>
          <EmptyDescription>
            {invalid && canConfigure ? (
              <UiTrans>
                Fix the errors in <code>.pages.yml</code> to manage this
                branch’s content and media.
              </UiTrans>
            ) : invalid ? (
              <UiTrans>
                This branch’s configuration needs fixing. Ask a project manager
                to fix it.
              </UiTrans>
            ) : canConfigure ? (
              <UiTrans>
                Add a <code>.pages.yml</code> file on{' '}
                <strong className="font-medium">{coordinates.branch}</strong> to
                choose the content and media you want to manage.
              </UiTrans>
            ) : (
              <UiTrans>
                This branch has no configuration. Ask a project manager to set
                it up.
              </UiTrans>
            )}
          </EmptyDescription>
        </EmptyHeader>
        {canConfigure ? (
          <EmptyContent>
            <Button asChild size="sm">
              <Link
                to="/github/$owner/$repo/$branch/configuration"
                params={coordinates}
              >
                {invalid
                  ? _t({ message: 'Edit configuration' })
                  : _t({ message: 'Configure' })}
              </Link>
            </Button>
          </EmptyContent>
        ) : null}
      </Empty>
    </div>
  )
}
