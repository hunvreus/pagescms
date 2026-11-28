import { msg } from '@lingui/core/macro'
import {
  useLingui as useUiMessages,
  Trans as UiTrans,
} from '@lingui/react/macro'
import { useLingui } from '@lingui/react'

import { HugeiconsIcon } from '@hugeicons/react'
import { Link } from '@tanstack/react-router'
import FileStack from '@hugeicons/core-free-icons/FileStackIcon'
import FileText from '@hugeicons/core-free-icons/FileTextIcon'
import FolderOpen from '@hugeicons/core-free-icons/Folder02Icon'
import Play from '@hugeicons/core-free-icons/PlayIcon'
import Zap from '@hugeicons/core-free-icons/ZapIcon'
import Plus from '@hugeicons/core-free-icons/PlusIcon'
import Pen from '@hugeicons/core-free-icons/Pen01Icon'
import ArrowRight from '@hugeicons/core-free-icons/ArrowRight02Icon'
import Upload from '@hugeicons/core-free-icons/Upload01Icon'
import Minus from '@hugeicons/core-free-icons/MinusIcon'
import UserPlus from '@hugeicons/core-free-icons/UserPlusIcon'
import Settings from '@hugeicons/core-free-icons/Settings02Icon'
import Users from '@hugeicons/core-free-icons/UsersIcon'
import { Badge } from '#/components/ui/badge'
import { ContentIcon } from '#/components/content-icon'
import { MediaFileIcon } from '#/components/media-file-icon'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '#/components/ui/tooltip'
import { relativeAge } from '#/features/drafts/relative-age'
import type { ActivityItem } from '#/lib/activity'
import type { ConfigurationNavigationItem } from '#/shared/configuration-navigation'

const actions = {
  added: msg({ message: 'added' }),
  edited: msg({ message: 'edited' }),
  uploaded: msg({ message: 'uploaded' }),
  deleted: msg({ message: 'deleted' }),
  renamed: msg({ message: 'renamed' }),
  invited: msg({ message: 'invited' }),
  removed: msg({ message: 'removed' }),
  updated: msg({ message: 'updated' }),
  run: msg({ message: 'ran' }),
}

const actionIcons = {
  added: Plus,
  edited: Pen,
  uploaded: Upload,
  deleted: Minus,
  renamed: ArrowRight,
  invited: UserPlus,
  removed: Minus,
  updated: Pen,
  run: Zap,
}

function destination(item: ActivityItem, base: string) {
  if (item.area === 'collaborator' || item.area === 'permissions')
    return `${base}/collaborators`
  if (item.area === 'configuration') return `${base}/configuration`
  if (item.area === 'action') return `${base}/actions`
  if (item.kind === 'deleted') return null
  const resource = encodeURIComponent(item.resource)
  if (item.area === 'media') return `${base}/media/${resource}`
  if (item.area === 'file') return `${base}/file/${resource}`
  return `${base}/collection/${resource}/entry/${item.path.split('/').map(encodeURIComponent).join('/')}`
}

export function ActivityFeedItem({
  item,
  base,
  resources,
}: {
  item: ActivityItem
  base: string
  resources: readonly ConfigurationNavigationItem[]
}) {
  const { t: remainingT } = useUiMessages()

  const { t: _t } = useUiMessages()
  const { i18n: dateI18n } = useLingui()

  const actor = item.actor?.trim() || remainingT({ message: 'Unknown user' })
  const ActionIcon = actionIcons[item.kind]
  const resource = resources.find(
    (value) => value.type === item.area && value.name === item.resource,
  )
  const href = destination(item, base)
  const subject =
    item.area === 'permissions'
      ? remainingT({ message: 'collaborator permissions' })
      : item.title || item.path.split('/').at(-1) || item.path
  const scoped = item.area === 'collection' || item.area === 'media'
  const Icon =
    item.area === 'configuration'
      ? Settings
      : item.area === 'action'
        ? Play
        : item.area === 'collaborator' || item.area === 'permissions'
          ? Users
          : FileText
  const when = new Date(item.occurredAt)
  const subjectIcon =
    item.area === 'media' ? (
      <MediaFileIcon path={item.path} className="mt-1 size-4 shrink-0" />
    ) : (
      <ContentIcon
        name={item.area === 'file' ? resource?.icon : undefined}
        fallback={Icon}
        className="mt-1 size-4 shrink-0"
      />
    )
  return (
    <li className="group/activity relative flex items-start gap-3 pb-5 last:pb-0">
      <span
        aria-hidden="true"
        data-slot="activity-connector"
        className="absolute top-6 bottom-0 left-3 w-px -translate-x-1/2 bg-border group-last/activity:hidden"
      />
      <span
        data-slot="activity-action"
        aria-hidden="true"
        className="relative flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground"
      >
        <HugeiconsIcon
          aria-hidden="true"
          icon={ActionIcon}
          className="size-3"
        />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-4">
          <p className="min-w-0 text-sm leading-6 break-words">
            <span className="font-medium">{actor}</span>{' '}
            <span className="text-muted-foreground">
              {dateI18n._(actions[item.kind])}
            </span>{' '}
            {href ? (
              <Link
                to={href}
                className="group/subject inline-flex max-w-full items-start gap-1 rounded-sm align-top font-medium focus-visible:outline-ring"
              >
                {subjectIcon}
                <span className="min-w-0 break-words group-hover/subject:underline">
                  {subject}
                </span>
              </Link>
            ) : (
              <span className="inline-flex max-w-full items-start gap-1 align-top font-medium">
                {subjectIcon}
                <span className="min-w-0 break-words">{subject}</span>
              </span>
            )}
            {scoped ? (
              <>
                {' '}
                <span className="text-muted-foreground">
                  {item.kind === 'added' || item.kind === 'uploaded'
                    ? _t({ message: 'to' })
                    : item.kind === 'deleted'
                      ? _t({ message: 'from' })
                      : _t({ message: 'in' })}
                </span>{' '}
                <Badge
                  variant="secondary"
                  className="max-w-full align-middle font-normal"
                >
                  <ContentIcon
                    name={resource?.icon}
                    fallback={
                      item.area === 'collection' ? FileStack : FolderOpen
                    }
                    className="shrink-0"
                    data-icon="inline-start"
                  />
                  <span className="min-w-0 break-words">
                    {(resource?.defaultLabel === 'media'
                      ? _t({ message: 'Media' })
                      : resource?.label) ||
                      (item.area === 'collection'
                        ? _t({ message: 'Collection' })
                        : _t({ message: 'Media' }))}
                  </span>
                </Badge>
              </>
            ) : null}
          </p>
          <Tooltip>
            <TooltipTrigger asChild>
              <time
                dateTime={item.occurredAt}
                tabIndex={0}
                className="shrink-0 rounded-sm text-sm leading-6 whitespace-nowrap text-muted-foreground focus-visible:outline-ring"
              >
                {relativeAge(when.getTime(), Date.now(), dateI18n.locale)}
              </time>
            </TooltipTrigger>
            <TooltipContent>
              {when.toLocaleString(dateI18n.locale, {
                timeZone: 'UTC',
                timeZoneName: 'short',
              })}
            </TooltipContent>
          </Tooltip>
        </div>
        {item.previousPath ? (
          <p className="mt-1 text-xs leading-5 break-words text-muted-foreground">
            <UiTrans>Previously </UiTrans>
            {item.previousPath}
          </p>
        ) : null}
      </div>
    </li>
  )
}
