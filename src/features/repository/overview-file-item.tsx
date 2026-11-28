import { useLingui } from '@lingui/react'
import { useLingui as useUiMessages } from '@lingui/react/macro'
import { HugeiconsIcon } from '@hugeicons/react'
import FileStack from '@hugeicons/core-free-icons/FileStackIcon'
import Folder from '@hugeicons/core-free-icons/Folder01Icon'
import type { ConfigurationNavigationItem } from '#/shared/configuration-navigation'
import { Link } from '@tanstack/react-router'
import { Badge } from '#/components/ui/badge'
import { ContentIcon } from '#/components/content-icon'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '#/components/ui/tooltip'
import { relativeAge } from '#/features/drafts/relative-age'
import type { EntrySummary } from '#/features/drafts/draft-store'
import {
  overviewBreadcrumbLabel,
  overviewEntryBreadcrumb,
  overviewParentLabel,
} from './overview-entry'

export function OverviewFileItem({
  entry,
  resource,
  configuration,
  draft = false,
}: {
  entry: EntrySummary
  resource?: ConfigurationNavigationItem
  configuration: Record<string, unknown>
  draft?: boolean
}) {
  const { t: _t } = useUiMessages()
  const { i18n: dateI18n } = useLingui()

  const segments = overviewEntryBreadcrumb(entry, configuration, resource).map(
    (segment) =>
      entry.target.kind === 'configuration'
        ? { ...segment, label: _t({ message: 'Configuration' }) }
        : !entry.title && segment.type === 'current'
          ? { ...segment, label: _t({ message: 'Untitled entry' }) }
          : segment,
  )
  const title = segments.find((segment) => segment.type === 'current')!.label
  const parents = segments.slice(0, -1)
  const parentLabel = overviewParentLabel(parents)
  const timestamp = new Date(entry.updatedAt)
  const detail = draft
    ? _t({
        message: `Draft saved ${timestamp.toLocaleString(dateI18n.locale, { timeZone: 'UTC', timeZoneName: 'short' })}`,
      })
    : _t({
        message: `Visited ${timestamp.toLocaleString(dateI18n.locale, { timeZone: 'UTC', timeZoneName: 'short' })}`,
      })
  return (
    <li className="flex min-w-0 items-center gap-4 py-2">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Link
          to={entry.href}
          aria-label={title}
          className="group/entry flex min-w-0 items-center rounded-sm text-sm focus-visible:outline-ring"
        >
          <span
            data-slot="overview-entry-title"
            className="min-w-0 truncate font-medium group-hover/entry:underline"
          >
            {title}
          </span>
        </Link>
        {parents.length ? (
          <Badge
            variant="secondary"
            data-overview-parent=""
            aria-label={_t({
              message: `Parent: ${overviewBreadcrumbLabel(parents)}`,
            })}
            className="hidden max-w-[40%] gap-1 sm:inline-flex"
          >
            {parents.at(-1)?.type === 'root' ? (
              <ContentIcon
                name={resource?.icon}
                fallback={FileStack}
                className="shrink-0"
                data-icon="inline-start"
              />
            ) : (
              <HugeiconsIcon
                icon={Folder}
                aria-hidden="true"
                className="shrink-0"
                data-icon="inline-start"
              />
            )}
            <span className="truncate">{parentLabel}</span>
          </Badge>
        ) : null}
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <time
            dateTime={timestamp.toISOString()}
            tabIndex={0}
            className="shrink-0 rounded-sm text-sm leading-7 whitespace-nowrap text-muted-foreground focus-visible:outline-ring"
          >
            {relativeAge(entry.updatedAt, Date.now(), dateI18n.locale)}
          </time>
        </TooltipTrigger>
        <TooltipContent>{detail}</TooltipContent>
      </Tooltip>
    </li>
  )
}
