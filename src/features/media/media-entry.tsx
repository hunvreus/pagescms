import { memo } from 'react'
import {
  Trans as UiTrans,
  useLingui as useUiMessages,
} from '@lingui/react/macro'
import { HugeiconsIcon } from '@hugeicons/react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import ArrowUpRight from '@hugeicons/core-free-icons/ArrowUpRight01Icon'
import Check from '@hugeicons/core-free-icons/CheckIcon'
import EllipsisVertical from '@hugeicons/core-free-icons/EllipsisVerticalIcon'
import File from '@hugeicons/core-free-icons/File02Icon'
import Folder from '@hugeicons/core-free-icons/Folder02Icon'

import { MediaThumbnail } from '#/components/media-thumbnail'
import { useRepositoryGitHubLink } from '#/hooks/use-repository-github-link'
import { Button } from '#/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { TableCell, TableRow } from '#/components/ui/table'
import { cn } from 'cn'

import { formatMediaSize, isImageMedia } from './media-model'

import type { MediaCoordinates } from './media-browser'
import type { MediaEntry, MediaView } from './media-model'

export interface MediaEntryProps {
  coordinates: MediaCoordinates
  entry: MediaEntry
  provider?: string
  /** Pending operation label; pending entries cannot be opened, selected or changed. */
  pending?: string
  selected: boolean
  canMove: boolean
  canRename: boolean
  canDelete: boolean
  source?: string
  onNavigate: (path: string) => void
  onSelect?: (path: string) => void
  onMove: (entry: MediaEntry) => void
  onRename: (entry: MediaEntry) => void
  onDelete: (entry: MediaEntry) => void
}

function githubUrl(coordinates: MediaCoordinates, path: string) {
  const encoded = path.split('/').map(encodeURIComponent).join('/')
  return `https://github.com/${encodeURIComponent(coordinates.owner)}/${encodeURIComponent(coordinates.repo)}/blob/${encodeURIComponent(coordinates.branch)}/${encoded}`
}

// Files drag onto folders; one node registers both roles.
function useMediaDnd(entry: MediaEntry, canMove: boolean) {
  const canDrag = canMove && entry.type === 'file' && Boolean(entry.sha)
  const draggable = useDraggable({
    id: entry.path,
    data: { entry },
    disabled: !canDrag,
  })
  const droppable = useDroppable({
    id: entry.path,
    data: { destination: entry.path },
    disabled: !canMove || entry.type !== 'dir',
  })
  return {
    canDrag,
    isDragging: draggable.isDragging,
    isOver: droppable.isOver,
    listeners: canDrag ? draggable.listeners : undefined,
    setNodeRef: (node: HTMLElement | null) => {
      draggable.setNodeRef(node)
      droppable.setNodeRef(node)
    },
  }
}

function EntryPreview({
  coordinates,
  entry,
  source,
  className,
  variant = 'list',
}: {
  coordinates: MediaCoordinates
  entry: MediaEntry
  source?: string | null
  className?: string
  variant?: MediaView
}) {
  if (entry.type === 'file' && isImageMedia(entry.path))
    return (
      <MediaThumbnail
        {...coordinates}
        repositorySource={coordinates.source}
        className={className}
        revision={entry.sha}
        initialLease={entry.delivery}
        variant={variant === 'grid' ? 'card' : 'thumbnail'}
        path={entry.path}
        source={source}
      />
    )
  const Icon = entry.type === 'dir' ? Folder : File
  return (
    <span
      className={cn('flex shrink-0 items-center justify-center', className)}
    >
      <HugeiconsIcon
        aria-hidden="true"
        icon={Icon}
        strokeWidth={variant === 'grid' ? 2 : undefined}
        className={cn(
          variant === 'grid' && 'text-muted-foreground',
          variant === 'grid'
            ? 'size-[clamp(4.5rem,8vw,6rem)] [&>*]:[vector-effect:non-scaling-stroke]'
            : 'size-4',
        )}
      />
    </span>
  )
}

function EntryActions({
  coordinates,
  provider,
  entry,
  canDelete,
  canMove,
  canRename,
  onMove,
  onRename,
  onDelete,
}: Pick<
  MediaEntryProps,
  | 'coordinates'
  | 'provider'
  | 'entry'
  | 'canDelete'
  | 'canRename'
  | 'canMove'
  | 'onMove'
  | 'onRename'
  | 'onDelete'
>) {
  const { t: _t } = useUiMessages()

  const canViewGitHub = useRepositoryGitHubLink() && provider === 'github'
  if (entry.type !== 'file') return null
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={_t({ message: `Actions for ${entry.name}` })}
          size="icon-sm"
          variant="ghost"
        >
          <HugeiconsIcon aria-hidden="true" icon={EllipsisVertical} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-max min-w-32 max-w-[calc(100vw-2rem)]"
      >
        {canViewGitHub ? (
          <DropdownMenuItem asChild>
            <a
              className="whitespace-nowrap"
              href={githubUrl(coordinates, entry.path)}
              rel="noreferrer"
              target="_blank"
            >
              <UiTrans>View on GitHub</UiTrans>{' '}
              <HugeiconsIcon
                aria-hidden="true"
                icon={ArrowUpRight}
                className="ml-auto opacity-50"
              />
            </a>
          </DropdownMenuItem>
        ) : null}
        {canViewGitHub && (canRename || canMove || canDelete) ? (
          <DropdownMenuSeparator />
        ) : null}
        {canRename ? (
          <DropdownMenuItem onSelect={() => onRename(entry)}>
            <UiTrans>Rename</UiTrans>
          </DropdownMenuItem>
        ) : null}
        {canMove && entry.sha ? (
          <DropdownMenuItem onSelect={() => onMove(entry)}>
            <UiTrans>Move to…</UiTrans>
          </DropdownMenuItem>
        ) : null}
        {canDelete ? (
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => onDelete(entry)}
          >
            <UiTrans>Delete</UiTrans>
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export const MediaGridEntry = memo(function MediaGridEntry({
  coordinates,
  provider,
  entry,
  pending,
  selected,
  canMove,
  canRename,
  canDelete,
  source,
  onNavigate,
  onSelect,
  onMove,
  onRename,
  onDelete,
}: MediaEntryProps) {
  const dnd = useMediaDnd(entry, canMove && !pending)
  const select = pending ? undefined : onSelect
  return (
    <div
      data-media-path={entry.path}
      data-dragging={dnd.isDragging || undefined}
      data-drop-active={dnd.isOver || undefined}
      ref={dnd.setNodeRef}
      className={cn(
        dnd.canDrag && 'cursor-grab',
        dnd.isDragging && 'cursor-grabbing',
        dnd.isOver && 'rounded-lg ring-2 ring-primary',
      )}
      {...dnd.listeners}
    >
      <div
        className={cn(
          'relative rounded-md',
          selected && 'ring-2 ring-ring ring-offset-2 ring-offset-background',
        )}
      >
        {entry.type === 'dir' ? (
          <button
            className="block w-full cursor-pointer rounded-md text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            type="button"
            disabled={Boolean(pending)}
            onClick={() => onNavigate(entry.path)}
          >
            <EntryPreview
              coordinates={coordinates}
              entry={entry}
              className="aspect-video w-full"
              variant="grid"
            />
            <span className="mt-2 block truncate px-3 text-center text-sm font-medium">
              {entry.name}
            </span>
            <span className="block h-4 text-center text-xs text-muted-foreground">
              {pending}
            </span>
          </button>
        ) : (
          <>
            <button
              aria-disabled={!select}
              aria-pressed={selected}
              className="block w-full rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              tabIndex={select ? undefined : -1}
              type="button"
              onClick={() => select?.(entry.path)}
            >
              <EntryPreview
                coordinates={coordinates}
                entry={entry}
                className="aspect-video w-full"
                source={source}
                variant="grid"
              />
            </button>
            <div className="flex min-w-0 items-start gap-1 pt-2">
              <button
                aria-disabled={!select}
                aria-pressed={selected}
                className="min-w-0 flex-1 text-left outline-none"
                tabIndex={select ? undefined : -1}
                type="button"
                onClick={() => select?.(entry.path)}
              >
                <span className="block truncate text-sm font-medium">
                  {entry.name}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {pending ?? formatMediaSize(entry.size)}
                </span>
              </button>
              {!pending ? (
                <EntryActions
                  provider={provider}
                  canDelete={canDelete}
                  canMove={canMove}
                  onMove={onMove}
                  canRename={canRename}
                  coordinates={coordinates}
                  entry={entry}
                  onDelete={onDelete}
                  onRename={onRename}
                />
              ) : null}
            </div>
          </>
        )}
        {entry.type === 'file' && selected ? (
          <span className="absolute top-2 left-2 rounded-full bg-primary p-0.5 text-primary-foreground">
            <HugeiconsIcon
              aria-hidden="true"
              icon={Check}
              className="size-3 stroke-3"
            />
          </span>
        ) : null}
      </div>
    </div>
  )
})

export const MediaTableRow = memo(function MediaTableRow({
  coordinates,
  provider,
  entry,
  pending,
  selected,
  canMove,
  canRename,
  canDelete,
  source,
  onNavigate,
  onSelect,
  onMove,
  onRename,
  onDelete,
}: MediaEntryProps) {
  const dnd = useMediaDnd(entry, canMove && !pending)
  return (
    <TableRow
      data-media-path={entry.path}
      data-state={selected ? 'selected' : undefined}
      ref={dnd.setNodeRef}
      className={cn(
        entry.type === 'dir' && 'cursor-pointer',
        dnd.canDrag && 'cursor-grab',
        dnd.isDragging && 'cursor-grabbing',
        dnd.isOver && 'ring-2 ring-inset ring-primary',
      )}
      {...dnd.listeners}
    >
      <TableCell className="py-0">
        <button
          data-media-drag-label
          disabled={Boolean(pending)}
          aria-pressed={entry.type === 'file' ? selected : undefined}
          className={cn(
            'flex min-w-0 items-center gap-3 text-left',
            entry.type === 'dir'
              ? 'cursor-pointer'
              : canMove
                ? 'cursor-grab active:cursor-grabbing'
                : onSelect && 'cursor-pointer',
          )}
          type="button"
          onClick={() =>
            entry.type === 'dir'
              ? onNavigate(entry.path)
              : onSelect?.(entry.path)
          }
        >
          <EntryPreview
            coordinates={coordinates}
            entry={entry}
            className="size-8"
            source={source}
          />
          <span className="truncate font-medium">{entry.name}</span>
          {pending ? (
            <span className="text-xs text-muted-foreground">{pending}</span>
          ) : null}
        </button>
      </TableCell>
      <TableCell>{formatMediaSize(entry.size)}</TableCell>
      <TableCell className="py-0 text-right">
        <div className="flex justify-end">
          {!pending ? (
            <EntryActions
              provider={provider}
              canDelete={canDelete}
              canMove={canMove}
              onMove={onMove}
              canRename={canRename}
              coordinates={coordinates}
              entry={entry}
              onDelete={onDelete}
              onRename={onRename}
            />
          ) : null}
        </div>
      </TableCell>
    </TableRow>
  )
})
