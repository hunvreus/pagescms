import {
  useLingui as useUiMessages,
  Trans as UiTrans,
} from '@lingui/react/macro'

import { HugeiconsIcon } from '@hugeicons/react'
import { Link } from '@tanstack/react-router'
import FileStack from '@hugeicons/core-free-icons/FileStackIcon'
import FileText from '@hugeicons/core-free-icons/FileTextIcon'
import Plus from '@hugeicons/core-free-icons/PlusIcon'
import SquarePen from '@hugeicons/core-free-icons/SquarePenIcon'
import { Button } from '#/components/ui/button'
import { Card, CardHeader, CardContent } from '#/components/ui/card'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '#/components/ui/tooltip'
import { ContentIcon } from '#/components/content-icon'
import { RepositoryActionButtons } from '#/components/repository-action-buttons'
import { getConfigurationNavigation } from '#/shared/configuration-navigation'
import { findMediaSchema } from '#/shared/configuration-content'
import { runnableRepositoryActions } from '#/lib/actions'
import { OverviewMediaUpload } from './overview-media-upload'

type Coordinates = { owner: string; repo: string; branch: string }

export function OverviewShortcuts({
  configuration,
  coordinates,
  runnableActions,
}: {
  configuration: Record<string, unknown>
  coordinates: Coordinates
  runnableActions: readonly string[]
}) {
  const { t: remainingT } = useUiMessages()

  const { t: _t } = useUiMessages()

  const links = getConfigurationNavigation(configuration)
  const actions = runnableRepositoryActions(
    configuration,
    'overview',
    runnableActions,
  )
  if (!links.length && !actions.length) return null
  return (
    <Card role="region" aria-label={_t({ message: 'Quick links' })}>
      <CardHeader>
        <h2 className="text-base font-medium">
          <UiTrans>Quick links</UiTrans>
        </h2>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-2">
        {links.map((node) => {
          if (node.type === 'media') {
            const destination = findMediaSchema(configuration, node.name)
            if (!destination) return null
            const extensions = Array.isArray(destination.extensions)
              ? destination.extensions.filter(
                  (value): value is string => typeof value === 'string',
                )
              : []
            return (
              <OverviewMediaUpload
                key={`${coordinates.owner}:${coordinates.repo}:${coordinates.branch}:${node.name}`}
                coordinates={{ ...coordinates, name: node.name }}
                label={
                  node.defaultLabel === 'media'
                    ? _t({ message: 'Media' })
                    : node.label
                }
                icon={node.icon}
                path={destination.input}
                extensions={extensions}
              />
            )
          }
          const action =
            node.type === 'collection'
              ? remainingT({ message: 'Add' })
              : remainingT({ message: 'Edit' })
          const ActionIcon = node.type === 'collection' ? Plus : SquarePen
          const description =
            node.type === 'collection'
              ? _t({ message: `Add an entry to ${node.label}` })
              : _t({ message: `Edit ${node.label}` })
          return (
            <Tooltip key={`${node.type}:${node.name}`}>
              <TooltipTrigger asChild>
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="max-w-full"
                >
                  <Link
                    to={
                      node.type === 'collection'
                        ? '/github/$owner/$repo/$branch/collection/$name/new'
                        : '/github/$owner/$repo/$branch/file/$name'
                    }
                    params={{ ...coordinates, name: node.name }}
                    aria-label={_t({ message: `${action} ${node.label}` })}
                  >
                    <ContentIcon
                      name={node.icon}
                      fallback={
                        node.type === 'collection' ? FileStack : FileText
                      }
                      className="size-4 shrink-0"
                      data-icon="inline-start"
                    />
                    <span className="min-w-0 truncate">{node.label}</span>
                    <HugeiconsIcon
                      aria-hidden="true"
                      icon={ActionIcon}
                      className="ml-1 size-4 shrink-0 text-muted-foreground transition-colors group-hover/button:text-foreground group-focus-visible/button:text-foreground"
                      data-icon="inline-end"
                    />
                  </Link>
                </Button>
              </TooltipTrigger>
              <TooltipContent>{description}</TooltipContent>
            </Tooltip>
          )
        })}
        <RepositoryActionButtons
          actions={actions}
          coordinates={coordinates}
          layout="inline"
          context={{ type: 'repository', name: null, path: null, data: {} }}
        />
      </CardContent>
    </Card>
  )
}
