import { Field, FieldLabel } from '#/components/ui/field'
import {
  completeMediaUpload,
  mediaParent,
  mediaRows,
  patchMedia,
  refreshMedia,
  useMediaJobs,
  useMediaMutation,
} from './media-mutations'
import { authenticationQueryOptions } from '#/queries/session'
import { readMediaView, saveMediaView } from './media-view'
import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import {
  columnVisibilityFeature,
  createColumnHelper,
  tableFeatures,
  useTable,
} from '@tanstack/react-table'
import {
  ArrowUp,
  ArrowUpRight,
  Check,
  EllipsisVertical,
  File,
  Folder,
  FolderPlus,
  Grid2X2,
  House,
  List,
  LoaderCircle,
  Search,
  Upload,
} from 'lucide-react'

import { MediaThumbnail } from '#/components/media-thumbnail'
import { useRepositoryGitHubLink } from '#/hooks/use-repository-github-link'
import { OperationError } from '#/components/operation-error'
import { RepositoryActionButtons } from '#/components/repository-action-buttons'
import { RepositoryPageHeader } from '#/components/repository-page-header'
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
import { Button } from '#/components/ui/button'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '#/components/ui/breadcrumb'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '#/components/ui/empty'
import { Input } from '#/components/ui/input'
import { ScrollArea } from '#/components/ui/scroll-area'
import { Skeleton } from '#/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '#/components/ui/toggle-group'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import {
  createMediaFolder,
  moveMedia,
  removeMedia,
  renameMedia,
} from '#/functions/media'
import { cn } from '#/lib/utils'
import { mediaDeliveryQueryOptions, mediaQueryOptions } from '#/queries/content'

import {
  formatMediaSize,
  isImageMedia,
  mediaLeaseRenewalDelay,
  mediaEntries,
  needsMediaDeliveryRefetch,
  parentMediaPath,
} from './media-model'
import { MediaUploadError, uploadMediaFiles } from './media-upload'

import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import type { ReactNode } from 'react'
import type { MediaEntry, MediaView } from './media-model'

export interface MediaCoordinates {
  owner: string
  repo: string
  branch: string
  name: string
}

export interface MediaBrowserProps {
  coordinates: MediaCoordinates
  path?: string
  onPathChange?: (path: string) => void
  extensions?: string[]
  onSelect?: (path: string) => void
  onSelectMany?: (paths: string[]) => void
  selectionLimit?: number
  selected?: string[]
  manage?: boolean
  showBreadcrumb?: boolean
  variant?: 'embedded' | 'page'
  className?: string
}

const table = tableFeatures({ columnVisibilityFeature })
const helper = createColumnHelper<typeof table, MediaEntry>()

function githubUrl(coordinates: MediaCoordinates, path: string) {
  const encoded = path.split('/').map(encodeURIComponent).join('/')
  return `https://github.com/${encodeURIComponent(coordinates.owner)}/${encodeURIComponent(coordinates.repo)}/blob/${encodeURIComponent(coordinates.branch)}/${encoded}`
}

function EntryPreview({
  coordinates,
  entry,
  source,
  loadingSource,
  onSourceError,
  className,
  variant = 'list',
}: {
  coordinates: MediaCoordinates
  entry: MediaEntry
  source?: string | null
  loadingSource?: boolean
  onSourceError?: (source: string) => void
  className?: string
  variant?: 'grid' | 'list'
}) {
  if (entry.type === 'dir') {
    return (
      <span
        className={cn('flex shrink-0 items-center justify-center', className)}
      >
        <Folder
          strokeWidth={variant === 'grid' ? 2 : undefined}
          className={cn(
            'text-muted-foreground',
            variant === 'grid'
              ? 'size-[clamp(4.5rem,8vw,6rem)] [&>*]:[vector-effect:non-scaling-stroke]'
              : 'size-5',
          )}
        />
      </span>
    )
  }
  return isImageMedia(entry.path) ? (
    <MediaThumbnail
      {...coordinates}
      className={className}
      allowProxy={false}
      loadingSource={loadingSource}
      path={entry.path}
      source={source}
      onSourceError={onSourceError}
    />
  ) : (
    <span
      className={cn('flex shrink-0 items-center justify-center', className)}
    >
      <File
        strokeWidth={variant === 'grid' ? 2 : undefined}
        className={cn(
          'text-muted-foreground',
          variant === 'grid'
            ? 'size-[clamp(4.5rem,8vw,6rem)] [&>*]:[vector-effect:non-scaling-stroke]'
            : 'size-5',
        )}
      />
    </span>
  )
}

const mediaGridClassName =
  'grid grid-cols-[repeat(auto-fill,minmax(min(100%,9rem),12rem))] justify-center gap-x-4 gap-y-6 sm:gap-x-6 md:gap-x-8 md:gap-y-8'

function MediaGridEntry({
  canDelete,
  canRename,
  coordinates,
  deliveryError,
  entry,
  pending,
  lease,
  onDelete,
  onNavigate,
  onRename,
  onSelect,
  renewFailedLease,
  renewingSources,
  selected,
}: {
  canDelete: boolean
  canRename: boolean
  coordinates: MediaCoordinates
  deliveryError: boolean
  entry: MediaEntry
  pending?: string
  lease?: { url: string }
  onDelete: (entry: MediaEntry) => void
  onNavigate: (path: string) => void
  onRename: (entry: MediaEntry) => void
  onSelect?: (path: string) => void
  renewFailedLease: (source: string) => void
  renewingSources: Set<string>
  selected: boolean
}) {
  return (
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
            aria-disabled={!onSelect}
            aria-pressed={selected}
            className="block w-full rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            tabIndex={onSelect ? undefined : -1}
            type="button"
            onClick={() => onSelect?.(entry.path)}
          >
            <EntryPreview
              coordinates={coordinates}
              entry={entry}
              className="aspect-video w-full"
              source={lease?.url}
              loadingSource={
                (!lease && !deliveryError) ||
                renewingSources.has(lease?.url ?? '')
              }
              onSourceError={renewFailedLease}
              variant="grid"
            />
          </button>
          <div className="flex min-w-0 items-start gap-1 pt-2">
            <button
              aria-disabled={!onSelect}
              aria-pressed={selected}
              className="min-w-0 flex-1 text-left outline-none"
              tabIndex={onSelect ? undefined : -1}
              type="button"
              onClick={() => onSelect?.(entry.path)}
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
                canDelete={canDelete}
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
          <Check className="size-3 stroke-3" />
        </span>
      ) : null}
    </div>
  )
}

function DraggableFile({
  entry,
  canMove,
  children,
}: {
  entry: MediaEntry
  canMove: boolean
  children: ReactNode
}) {
  const canDrag = canMove && entry.type === 'file' && Boolean(entry.sha)
  const draggable = useDraggable({
    id: entry.path,
    data: { entry },
    disabled: !canDrag,
  })
  return (
    <div
      data-media-path={entry.type === 'file' ? entry.path : undefined}
      data-dragging={draggable.isDragging || undefined}
      ref={draggable.setNodeRef}
      className={cn(
        canDrag && 'cursor-grab',
        draggable.isDragging && 'cursor-grabbing',
      )}
      {...(canDrag ? draggable.listeners : undefined)}
    >
      {children}
    </div>
  )
}

function DroppableFolder({
  entry,
  canMove,
  children,
}: {
  entry: MediaEntry
  canMove: boolean
  children: ReactNode
}) {
  const droppable = useDroppable({
    id: entry.path,
    data: { entry },
    disabled: !canMove || entry.type !== 'dir',
  })
  return (
    <div
      data-media-path={entry.type === 'dir' ? entry.path : undefined}
      data-drop-active={droppable.isOver || undefined}
      ref={droppable.setNodeRef}
      className={cn(droppable.isOver && 'rounded-lg ring-2 ring-primary')}
    >
      {children}
    </div>
  )
}

function MediaTableRow({
  entry,
  canMove,
  children,
  selected,
}: {
  entry: MediaEntry
  canMove: boolean
  children: ReactNode
  selected: boolean
}) {
  const canDrag = canMove && entry.type === 'file' && Boolean(entry.sha)
  const draggable = useDraggable({
    id: entry.path,
    data: { entry },
    disabled: !canDrag,
  })
  const droppable = useDroppable({
    id: entry.path,
    data: { entry },
    disabled: !canMove || entry.type !== 'dir',
  })
  const setNodeRef = (node: HTMLTableRowElement | null) => {
    draggable.setNodeRef(node)
    droppable.setNodeRef(node)
  }

  return (
    <TableRow
      data-media-path={entry.path}
      data-state={selected ? 'selected' : undefined}
      ref={setNodeRef}
      className={cn(
        entry.type === 'dir' && 'cursor-pointer',
        canDrag && 'cursor-grab',
        draggable.isDragging && 'cursor-grabbing',
        droppable.isOver && 'ring-2 ring-inset ring-primary',
      )}
      {...(canDrag ? draggable.listeners : undefined)}
    >
      {children}
    </TableRow>
  )
}

function MediaDragOverlay({
  coordinates,
  entry,
  lease,
  view,
}: {
  coordinates: MediaCoordinates
  entry: MediaEntry
  lease?: { url: string }
  view: MediaView
}) {
  return (
    <div
      data-media-drag-overlay
      className={cn(
        'pointer-events-none overflow-hidden rounded-md border bg-popover shadow-lg',
        view === 'grid' ? 'w-48 p-2' : 'flex w-80 items-center gap-3 p-3',
      )}
    >
      <EntryPreview
        coordinates={coordinates}
        entry={entry}
        className={cn(
          view === 'grid'
            ? 'aspect-video w-full'
            : 'size-10 overflow-hidden rounded-sm',
        )}
        source={lease?.url}
        variant={view}
      />
      <div className={cn('min-w-0', view === 'grid' && 'pt-2')}>
        <span className="block truncate text-sm font-medium">{entry.name}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {formatMediaSize(entry.size)}
        </span>
      </div>
    </div>
  )
}

function EntryActions({
  coordinates,
  entry,
  canDelete,
  canRename,
  onRename,
  onDelete,
}: {
  coordinates: MediaCoordinates
  entry: MediaEntry
  canDelete: boolean
  canRename: boolean
  onRename: (entry: MediaEntry) => void
  onDelete: (entry: MediaEntry) => void
}) {
  const canViewGitHub = useRepositoryGitHubLink()
  if (entry.type !== 'file') return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={`Actions for ${entry.name}`}
          size="icon-sm"
          variant="ghost"
        >
          <EllipsisVertical />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        {canViewGitHub ? (
          <DropdownMenuItem asChild>
            <a
              className="whitespace-nowrap"
              href={githubUrl(coordinates, entry.path)}
              rel="noreferrer"
              target="_blank"
            >
              View on GitHub <ArrowUpRight className="ml-auto opacity-50" />
            </a>
          </DropdownMenuItem>
        ) : null}
        {canViewGitHub && (canRename || canDelete) ? (
          <DropdownMenuSeparator />
        ) : null}
        {canRename ? (
          <>
            <DropdownMenuItem onSelect={() => onRename(entry)}>
              Rename
            </DropdownMenuItem>
          </>
        ) : null}
        {canDelete ? (
          <>
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => onDelete(entry)}
            >
              Delete
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function MediaBreadcrumb({
  label,
  rootPath,
  path,
  onNavigate,
  compact = false,
  title = false,
}: {
  label: string
  rootPath: string
  path: string
  onNavigate: (path: string) => void
  compact?: boolean
  title?: boolean
}) {
  const relative = path
    .slice(rootPath.length)
    .replace(/^\/+/, '')
    .split('/')
    .filter(Boolean)
  const entries = relative.map((name, index) => ({
    name,
    path: [rootPath, ...relative.slice(0, index + 1)].filter(Boolean).join('/'),
  }))

  return (
    <Breadcrumb className="min-w-0 overflow-hidden">
      <BreadcrumbList
        className={cn(
          'flex-nowrap',
          title && 'text-lg font-medium',
          compact && 'gap-1.5 sm:gap-2.5',
        )}
      >
        <BreadcrumbItem className="shrink-0">
          {entries.length ? (
            <BreadcrumbLink asChild className={cn(title && 'font-medium')}>
              <button
                aria-label={compact ? label : undefined}
                className="cursor-pointer"
                type="button"
                onClick={() => onNavigate(rootPath)}
              >
                {compact ? <House className="size-3.5" /> : label}
              </button>
            </BreadcrumbLink>
          ) : (
            <BreadcrumbPage className={cn(title && 'font-medium')}>
              {compact ? (
                <>
                  <House className="size-3.5" />
                  <span className="sr-only">{label}</span>
                </>
              ) : (
                label
              )}
            </BreadcrumbPage>
          )}
        </BreadcrumbItem>
        {entries.map((entry, index) => {
          const current = index === entries.length - 1
          return (
            <Fragment key={entry.path}>
              <BreadcrumbSeparator />
              <BreadcrumbItem className={current ? 'min-w-0' : 'shrink-0'}>
                {current ? (
                  <BreadcrumbPage
                    className={cn('block truncate', title && 'font-medium')}
                  >
                    {entry.name}
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink
                    asChild
                    className={cn(title && 'font-medium')}
                  >
                    <button
                      type="button"
                      onClick={() => onNavigate(entry.path)}
                    >
                      {entry.name}
                    </button>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </Fragment>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}

export function MediaBrowser({
  coordinates,
  path,
  onPathChange,
  extensions,
  onSelect,
  onSelectMany,
  selected = [],
  selectionLimit = 1,
  manage = true,
  showBreadcrumb = true,
  variant = 'embedded',
  className,
}: MediaBrowserProps) {
  const fieldPrefix = useId()
  const queryClient = useQueryClient()
  const [localPath, setLocalPath] = useState(path)
  const currentPath = path ?? localPath
  const query = useQuery({
    ...mediaQueryOptions({ ...coordinates, path: currentPath }),
    placeholderData: keepPreviousData,
  })
  const [search, setSearch] = useState('')
  const [view, setView] = useState<MediaView>(readMediaView)
  const [error, setError] = useState<unknown>(null)
  const operations = useMediaJobs(coordinates)
  const uploadMutation = useMediaMutation<string[]>()
  const folderMutation =
    useMediaMutation<Awaited<ReturnType<typeof createMediaFolder>>>()
  const renameMutation =
    useMediaMutation<Awaited<ReturnType<typeof renameMedia>>>()
  const removalMutation =
    useMediaMutation<Awaited<ReturnType<typeof removeMedia>>>()
  const moveMutation = useMediaMutation<Awaited<ReturnType<typeof moveMedia>>>()
  const mounted = useRef(false)
  const currentView = useRef('')
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const [folderOpen, setFolderOpen] = useState(false)
  const [folderName, setFolderName] = useState('')
  const [renameEntry, setRenameEntry] = useState<MediaEntry | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deleteEntry, setDeleteEntry] = useState<MediaEntry | null>(null)
  const [draggingFiles, setDraggingFiles] = useState(false)
  const [activeDragEntry, setActiveDragEntry] = useState<MediaEntry | null>(
    null,
  )
  const uploadInputRef = useRef<HTMLInputElement>(null)
  const [renewingSources, setRenewingSources] = useState<Set<string>>(
    () => new Set(),
  )
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  )
  const data = query.data
  const folderPending = query.isPending || query.isPlaceholderData
  const manifestUnavailable = query.isError && !data
  const rootPath = data?.media.rootPath ?? currentPath ?? ''
  const directoryPath = query.isPlaceholderData
    ? (currentPath ?? rootPath)
    : (data?.media.path ?? currentPath ?? rootPath)
  currentView.current = JSON.stringify([
    coordinates.owner.toLowerCase(),
    coordinates.repo.toLowerCase(),
    coordinates.branch,
    coordinates.name,
    directoryPath,
  ])
  const pendingJobs = useMemo(
    () =>
      operations.jobs
        .filter((item) => item.status === 'pending')
        .flatMap((item) => (item.job ? [item.job] : [])),
    [operations.jobs],
  )
  const uploading = pendingJobs.some(
    (job) => job.kind === 'upload' && job.directory === directoryPath,
  )
  const pending = useMemo(() => {
    const result = new Map<string, string>()
    for (const job of pendingJobs) {
      if (job.kind === 'folder')
        result.set(`__pending__/${job.id}`, 'Creating…')
      if (job.kind === 'upload')
        job.files?.forEach((_file, index) => {
          if (!operations.completed[job.id]?.includes(index))
            result.set(`__pending__/${job.id}/${index}`, 'Uploading…')
        })
      if (job.entry)
        result.set(
          job.entry.path,
          job.kind === 'rename' ? 'Renaming…' : 'Moving…',
        )
    }
    return result
  }, [pendingJobs, operations.completed])
  const entries = useMemo(
    () =>
      folderPending
        ? []
        : mediaRows(
            data?.entries ?? [],
            pendingJobs,
            directoryPath,
            operations.completed,
          ),
    [
      folderPending,
      data?.entries,
      pendingJobs,
      directoryPath,
      operations.completed,
    ],
  )
  const imagePaths = useMemo(
    () =>
      entries
        .filter(
          (entry) =>
            entry.type === 'file' &&
            !pending.has(entry.path) &&
            isImageMedia(entry.path),
        )
        .map((entry) => entry.path),
    [entries, pending],
  )
  const deliveryQuery = useQuery({
    ...mediaDeliveryQueryOptions({
      ...coordinates,
      path: currentPath,
      paths: imagePaths,
    }),
    enabled: typeof window !== 'undefined' && imagePaths.length > 0,
  })
  const leases = useMemo(
    () =>
      new Map(
        (deliveryQuery.data?.leases ?? []).map((lease) => [lease.path, lease]),
      ),
    [deliveryQuery.data?.leases],
  )
  const coveredDeliveryPaths = useMemo(
    () =>
      new Set([
        ...leases.keys(),
        ...(deliveryQuery.data?.errors ?? []).map(
          (deliveryError) => deliveryError.path,
        ),
      ]),
    [deliveryQuery.data?.errors, leases],
  )
  const renewedFailures = useRef(new Set<string>())

  useEffect(() => {
    if (
      !needsMediaDeliveryRefetch(
        imagePaths,
        coveredDeliveryPaths,
        deliveryQuery.isFetching,
      )
    )
      return
    void deliveryQuery.refetch()
  }, [
    coveredDeliveryPaths,
    deliveryQuery.isFetching,
    deliveryQuery.refetch,
    imagePaths,
  ])

  useEffect(() => {
    const delay = mediaLeaseRenewalDelay([...leases.values()])
    if (delay === null) return
    const timeout = window.setTimeout(() => void deliveryQuery.refetch(), delay)
    return () => window.clearTimeout(timeout)
  }, [deliveryQuery.refetch, leases])

  const renewFailedLease = useCallback(
    (source: string) => {
      if (renewedFailures.current.has(source)) return
      renewedFailures.current.add(source)
      setRenewingSources((current) => new Set(current).add(source))
      void deliveryQuery.refetch().finally(() => {
        setRenewingSources((current) => {
          const next = new Set(current)
          next.delete(source)
          return next
        })
      })
    },
    [deliveryQuery.refetch],
  )
  const visible = useMemo(
    () => mediaEntries(entries, { search, extensions }),
    [entries, extensions, search],
  )
  const selectedPaths = useMemo(() => new Set(selected), [selected])
  const selecting = Boolean(onSelect || onSelectMany)
  const canCreateDirectory =
    manage && Boolean(data?.media.capabilities.createDirectory)
  const canUpload = manage && Boolean(data?.media.capabilities.upload)
  const canMove =
    manage && Boolean(data?.media.capabilities.move) && !folderPending
  const canRename = manage && Boolean(data?.media.capabilities.rename)
  const canDelete = manage && Boolean(data?.media.capabilities.remove)
  const creatingFolder = pendingJobs.some(
    (job) => job.directory === directoryPath && job.kind === 'folder',
  )
  const renaming = pendingJobs.some(
    (job) => job.entry?.path === renameEntry?.path && job.kind === 'rename',
  )
  const deleting = pendingJobs.some(
    (job) => job.entry?.path === deleteEntry?.path && job.kind === 'delete',
  )
  const controlsDisabled = folderPending

  function navigate(next: string) {
    setSearch('')
    setError(null)
    setFolderOpen(false)
    setRenameEntry(null)
    setDeleteEntry(null)
    if (onPathChange) onPathChange(next)
    else setLocalPath(next)
  }

  function sameView(origin: string) {
    return mounted.current && currentView.current === origin
  }
  function confirmedMediaEntry(
    result: { path: string; version: string | null },
    entry?: MediaEntry,
    file?: File,
  ): MediaEntry {
    return {
      id: result.path,
      type: entry?.type ?? 'file',
      path: result.path,
      name: result.path.split('/').at(-1)!,
      sha: result.version,
      size: file?.size ?? entry?.size ?? null,
      contentType: file?.type ?? entry?.contentType ?? null,
    }
  }
  async function upload(files: FileList | File[]) {
    const values = Array.from(files).slice(
      0,
      selecting && Number.isFinite(selectionLimit) ? selectionLimit : undefined,
    )
    if (!canUpload || uploading || !values.length) return
    const origin = currentView.current
    const account = queryClient.getQueryData(
      authenticationQueryOptions().queryKey,
    )?.user?.id
    if (!account) return
    const id = crypto.randomUUID()
    setError(null)
    try {
      await uploadMutation.run({
        id,
        coordinates,
        kind: 'upload',
        directory: directoryPath,
        paths: [
          directoryPath,
          ...values.map((file) => `${directoryPath}/${file.name}`),
        ],
        files: values,
        run: () =>
          uploadMediaFiles({
            coordinates,
            extensions,
            isActive: () =>
              queryClient.getQueryData(authenticationQueryOptions().queryKey)
                ?.user?.id === account,
            files: values,
            path: directoryPath,
            onUploaded: (result, file, index) => {
              if (
                queryClient.getQueryData(authenticationQueryOptions().queryKey)
                  ?.user?.id !== account
              )
                return
              patchMedia(
                queryClient,
                coordinates,
                [],
                confirmedMediaEntry(result, undefined, file),
              )
              completeMediaUpload(queryClient, account, id, index)
            },
          }),
        confirmed: (paths, active) => {
          if (!active()) return
          refreshMedia(queryClient, coordinates, [directoryPath])
          if (sameView(origin)) {
            if (onSelectMany) onSelectMany(paths)
            else if (onSelect) paths.forEach(onSelect)
          }
        },
      })
    } catch (cause) {
      if (
        sameView(origin) &&
        queryClient.getQueryData(authenticationQueryOptions().queryKey)?.user
          ?.id === account
      ) {
        setError(cause)
        if (cause instanceof MediaUploadError && cause.paths.length) {
          if (onSelectMany) onSelectMany(cause.paths)
          else if (onSelect) cause.paths.forEach(onSelect)
        }
      }
      if (
        queryClient.getQueryData(authenticationQueryOptions().queryKey)?.user
          ?.id === account
      )
        refreshMedia(queryClient, coordinates, [directoryPath])
    } finally {
      if (sameView(origin)) setDraggingFiles(false)
    }
  }
  async function createFolder() {
    const filename = folderName.trim()
    if (!canCreateDirectory || !filename || creatingFolder) return
    const origin = currentView.current
    setError(null)
    try {
      await folderMutation.run({
        id: crypto.randomUUID(),
        coordinates,
        kind: 'folder',
        directory: directoryPath,
        filename,
        destination: `${directoryPath}/${filename}`,
        paths: [`${directoryPath}/${filename}`],
        run: () =>
          createMediaFolder({
            data: { ...coordinates, path: directoryPath, folder: filename },
          }),
        confirmed: (result, active) => {
          if (!active()) return
          patchMedia(queryClient, coordinates, [], {
            ...confirmedMediaEntry(result),
            type: 'dir',
          })
          refreshMedia(queryClient, coordinates, [directoryPath])
          if (sameView(origin)) {
            setFolderName('')
            setFolderOpen(false)
          }
        },
      })
    } catch (cause) {
      if (sameView(origin)) setError(cause)
    }
  }
  async function rename() {
    const entry = renameEntry
    const filename = renameValue.trim()
    if (!canRename || !entry?.sha || !filename || renaming) return
    const origin = currentView.current
    const destination = [mediaParent(entry.path), filename]
      .filter(Boolean)
      .join('/')
    setError(null)
    try {
      await renameMutation.run({
        id: crypto.randomUUID(),
        coordinates,
        kind: 'rename',
        directory: directoryPath,
        entry,
        filename,
        destination,
        paths: [entry.path, destination],
        run: () =>
          renameMedia({
            data: {
              ...coordinates,
              path: entry.path,
              sha: entry.sha!,
              filename,
            },
          }),
        confirmed: (result, active) => {
          if (!active()) return
          patchMedia(
            queryClient,
            coordinates,
            [entry.path],
            confirmedMediaEntry(result, entry),
          )
          refreshMedia(queryClient, coordinates, [directoryPath])
          if (sameView(origin)) setRenameEntry(null)
        },
      })
    } catch (cause) {
      if (sameView(origin)) setError(cause)
    }
  }
  async function remove() {
    const entry = deleteEntry
    if (!canDelete || !entry?.sha || deleting) return
    const origin = currentView.current
    setError(null)
    try {
      await removalMutation.run({
        id: crypto.randomUUID(),
        coordinates,
        kind: 'delete',
        directory: directoryPath,
        entry,
        paths: [entry.path],
        run: () =>
          removeMedia({
            data: { ...coordinates, path: entry.path, sha: entry.sha! },
          }),
        confirmed: (_result, active) => {
          if (!active()) return
          patchMedia(queryClient, coordinates, [entry.path])
          refreshMedia(queryClient, coordinates, [directoryPath])
          if (sameView(origin)) setDeleteEntry(null)
        },
      })
    } catch (cause) {
      if (sameView(origin)) setError(cause)
    }
  }
  async function move(event: DragEndEvent) {
    const entry = event.active.data.current?.entry as MediaEntry | undefined
    const destination = event.over?.data.current?.entry as
      MediaEntry | undefined
    setActiveDragEntry(null)
    if (
      !canMove ||
      !entry?.sha ||
      entry.type !== 'file' ||
      destination?.type !== 'dir' ||
      pending.has(entry.path) ||
      pending.has(destination.path)
    )
      return
    const origin = currentView.current
    const newPath = `${destination.path}/${entry.name}`
    setError(null)
    try {
      await moveMutation.run({
        id: crypto.randomUUID(),
        coordinates,
        kind: 'move',
        directory: directoryPath,
        entry,
        destination: newPath,
        paths: [entry.path, newPath],
        run: () =>
          moveMedia({
            data: {
              ...coordinates,
              path: entry.path,
              sha: entry.sha!,
              destination: destination.path,
            },
          }),
        confirmed: (result, active) => {
          if (!active()) return
          patchMedia(
            queryClient,
            coordinates,
            [entry.path],
            confirmedMediaEntry(result, entry),
          )
          refreshMedia(queryClient, coordinates, [
            directoryPath,
            destination.path,
          ])
        },
      })
    } catch (cause) {
      if (sameView(origin)) setError(cause)
    }
  }

  function startMove(event: DragStartEvent) {
    const entry = event.active.data.current?.entry as MediaEntry | undefined
    setActiveDragEntry(entry?.type === 'file' ? entry : null)
  }

  const columns = useMemo(
    () =>
      helper.columns([
        helper.accessor((entry) => entry.name, {
          id: 'name',
          header: 'Name',
          cell: ({ row }) => {
            const entry = row.original
            const isSelected = selectedPaths.has(entry.path)
            return (
              <button
                disabled={pending.has(entry.path)}
                aria-pressed={entry.type === 'file' ? isSelected : undefined}
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
                  pending.has(entry.path)
                    ? undefined
                    : entry.type === 'dir'
                      ? navigate(entry.path)
                      : onSelect?.(entry.path)
                }
              >
                <EntryPreview
                  coordinates={coordinates}
                  entry={entry}
                  className="size-9"
                  source={leases.get(entry.path)?.url}
                  loadingSource={
                    (!leases.has(entry.path) && !deliveryQuery.isError) ||
                    renewingSources.has(leases.get(entry.path)?.url ?? '')
                  }
                  onSourceError={renewFailedLease}
                />
                <span className="truncate font-medium">{entry.name}</span>
                {pending.get(entry.path) ? (
                  <span className="text-xs text-muted-foreground">
                    {pending.get(entry.path)}
                  </span>
                ) : null}
              </button>
            )
          },
        }),
        helper.accessor((entry) => entry.size, {
          id: 'size',
          header: 'Size',
          cell: ({ getValue }) => formatMediaSize(getValue()),
        }),
        helper.display({
          id: 'actions',
          header: '',
          cell: ({ row }) => (
            <div className="flex justify-end">
              {!pending.has(row.original.path) ? (
                <EntryActions
                  canDelete={canDelete && !pending.has(row.original.path)}
                  canRename={canRename && !pending.has(row.original.path)}
                  coordinates={coordinates}
                  entry={row.original}
                  onDelete={setDeleteEntry}
                  onRename={(entry) => {
                    setRenameEntry(entry)
                    setRenameValue(entry.name)
                  }}
                />
              ) : null}
            </div>
          ),
        }),
      ]),
    [
      coordinates,
      canDelete,
      canMove,
      canRename,
      deliveryQuery.isError,
      leases,
      onSelect,
      renewFailedLease,
      renewingSources,
      selectedPaths,
      pending,
    ],
  )
  const mediaTable = useTable(
    {
      features: table,
      columns,
      data: visible,
      getRowId: (entry) => entry.path,
    },
    (state) => ({ columnVisibility: state.columnVisibility }),
  )

  const searchControl = (
    <div className="relative w-full sm:w-64">
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        disabled={folderPending}
        className="pl-8"
        placeholder="Search media…"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
    </div>
  )
  const viewControls = (
    <ToggleGroup
      aria-label="Media view"
      spacing={0}
      type="single"
      value={view}
      variant="outline"
      onValueChange={(value) => {
        if (value !== 'grid' && value !== 'list') return
        setView(value)
        try {
          saveMediaView(value)
        } catch {
          // Keep the selected view for this session when storage is unavailable.
        }
      }}
    >
      <ToggleGroupItem
        aria-label="Grid view"
        disabled={folderPending}
        value="grid"
      >
        <Grid2X2 />
      </ToggleGroupItem>
      <ToggleGroupItem
        aria-label="List view"
        disabled={folderPending}
        value="list"
      >
        <List />
      </ToggleGroupItem>
    </ToggleGroup>
  )
  const showPendingManageControls = manage && !data
  const manageControls =
    canCreateDirectory || canUpload || showPendingManageControls ? (
      <>
        {canCreateDirectory || showPendingManageControls ? (
          <Button
            aria-label="New folder"
            disabled={controlsDisabled || !canCreateDirectory}
            size="icon"
            variant="outline"
            onClick={() => setFolderOpen(true)}
          >
            <FolderPlus />
          </Button>
        ) : null}
        {canUpload || showPendingManageControls ? (
          <>
            <Button
              disabled={controlsDisabled || !canUpload || uploading}
              onClick={() => uploadInputRef.current?.click()}
            >
              {uploading ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <Upload />
              )}{' '}
              {uploading ? 'Uploading…' : 'Upload'}
            </Button>
            <input
              multiple
              className="sr-only"
              disabled={controlsDisabled || !canUpload || uploading}
              ref={uploadInputRef}
              type="file"
              accept={extensions?.map((value) => `.${value}`).join(',')}
              onChange={(event) => {
                void upload(event.target.files ?? [])
                event.target.value = ''
              }}
            />
          </>
        ) : null}
      </>
    ) : null
  const repositoryActionControls = data ? (
    <RepositoryActionButtons
      actions={data.media.actions}
      disabled={folderPending}
      context={{
        type: 'media',
        name: data.media.name,
        path: data.media.path,
        data: {
          label: data.media.label,
          input: data.media.rootPath,
          output: data.media.output,
        },
      }}
      coordinates={coordinates}
    />
  ) : null
  const tableResults = (
    <Table containerClassName="rounded-xl border bg-card">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          {mediaTable.getHeaderGroups()[0]?.headers.map((header) => (
            <TableHead key={header.id}>
              {header.isPlaceholder ? null : (
                <mediaTable.FlexRender header={header} />
              )}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {!visible.length ? (
          <TableRow className="hover:bg-transparent">
            <TableCell
              colSpan={mediaTable.getVisibleLeafColumns().length}
              className="text-center text-muted-foreground"
            >
              {search ? 'No matching media.' : 'No media yet.'}
            </TableCell>
          </TableRow>
        ) : null}
        {mediaTable.getRowModel().rows.map((row) => (
          <MediaTableRow
            canMove={canMove && !pending.has(row.original.path)}
            entry={row.original}
            key={row.id}
            selected={selectedPaths.has(row.original.path)}
          >
            {row.getVisibleCells().map((cell) => (
              <TableCell
                className={
                  cell.column.id === 'actions'
                    ? 'py-0 text-right'
                    : cell.column.id === 'name'
                      ? 'py-0'
                      : undefined
                }
                key={cell.id}
              >
                <mediaTable.FlexRender cell={cell} />
              </TableCell>
            ))}
          </MediaTableRow>
        ))}
      </TableBody>
    </Table>
  )
  const emptyResults = (
    <Empty className="min-h-64 border">
      <EmptyHeader>
        <EmptyTitle className="text-muted-foreground">
          {search ? 'No matching media' : 'No media yet'}
        </EmptyTitle>
        <EmptyDescription>
          {search
            ? 'Try a different search.'
            : 'Upload a file or create a folder to get started.'}
        </EmptyDescription>
      </EmptyHeader>
      {search ? (
        <EmptyContent>
          <Button variant="outline" onClick={() => setSearch('')}>
            Clear search
          </Button>
        </EmptyContent>
      ) : null}
    </Empty>
  )
  const gridResults = (
    <div className={mediaGridClassName}>
      {visible.map((entry) => (
        <DroppableFolder
          canMove={canMove && !pending.has(entry.path)}
          entry={entry}
          key={entry.path}
        >
          <DraggableFile
            canMove={canMove && !pending.has(entry.path)}
            entry={entry}
          >
            <MediaGridEntry
              canDelete={canDelete && !pending.has(entry.path)}
              canRename={canRename && !pending.has(entry.path)}
              pending={pending.get(entry.path)}
              coordinates={coordinates}
              deliveryError={deliveryQuery.isError}
              entry={entry}
              lease={leases.get(entry.path)}
              onDelete={setDeleteEntry}
              onNavigate={(nextPath) => {
                if (!pending.has(entry.path)) navigate(nextPath)
              }}
              onRename={(value) => {
                setRenameEntry(value)
                setRenameValue(value.name)
              }}
              onSelect={pending.has(entry.path) ? undefined : onSelect}
              renewFailedLease={renewFailedLease}
              renewingSources={renewingSources}
              selected={selectedPaths.has(entry.path)}
            />
          </DraggableFile>
        </DroppableFolder>
      ))}
    </div>
  )
  const mediaResults = (
    <>
      <OperationError
        error={
          error ??
          operations.jobs
            .filter((item) => item.job?.directory === directoryPath)
            .at(-1)?.error
        }
        fallback="Could not update media."
      />
      {manifestUnavailable ? (
        <Empty className="min-h-64 border">
          <EmptyHeader>
            <EmptyTitle>Could not load media</EmptyTitle>
            <EmptyDescription>
              Check your connection and try again.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" onClick={() => void query.refetch()}>
              Try again
            </Button>
          </EmptyContent>
        </Empty>
      ) : folderPending ? (
        <MediaBrowserSkeleton view={view} />
      ) : visible.length ? (
        view === 'grid' ? (
          gridResults
        ) : (
          tableResults
        )
      ) : view === 'list' ? (
        tableResults
      ) : (
        emptyResults
      )}
    </>
  )

  return (
    <DndContext
      sensors={sensors}
      onDragCancel={() => setActiveDragEntry(null)}
      onDragEnd={(event) => void move(event)}
      onDragStart={startMove}
    >
      {variant === 'page' ? (
        <RepositoryPageHeader
          refreshing={query.isFetching}
          actions={
            <>
              {searchControl}
              {viewControls}
              {manageControls}
              {repositoryActionControls}
            </>
          }
        >
          {data ? (
            <MediaBreadcrumb
              title
              label={data.media.label}
              path={directoryPath}
              rootPath={data.media.rootPath}
              onNavigate={navigate}
            />
          ) : (
            <Skeleton className="h-5 w-40" />
          )}
        </RepositoryPageHeader>
      ) : null}
      <section
        className={cn(
          'relative',
          variant === 'page'
            ? 'space-y-4 p-4 md:p-6'
            : 'flex min-h-0 flex-1 flex-col gap-4',
          className,
        )}
        onDragEnter={(event) => {
          if (canUpload && event.dataTransfer.types.includes('Files')) {
            event.preventDefault()
            setDraggingFiles(true)
          }
        }}
        onDragOver={(event) => {
          if (canUpload && event.dataTransfer.types.includes('Files'))
            event.preventDefault()
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node))
            setDraggingFiles(false)
        }}
        onDrop={(event) => {
          if (!canUpload || !event.dataTransfer.files.length) return
          event.preventDefault()
          void upload(event.dataTransfer.files)
        }}
      >
        {variant === 'embedded' ? (
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <div className="min-w-0 flex-1 overflow-hidden">
              {showBreadcrumb ? (
                <div className="hidden sm:block">
                  <MediaBreadcrumb
                    compact
                    label={data?.media.label ?? rootPath}
                    path={directoryPath}
                    rootPath={rootPath}
                    onNavigate={navigate}
                  />
                </div>
              ) : null}
              {directoryPath !== rootPath ? (
                <Button
                  aria-label="Parent folder"
                  className="sm:hidden"
                  size="icon"
                  variant="outline"
                  onClick={() =>
                    navigate(parentMediaPath(directoryPath, rootPath))
                  }
                >
                  <ArrowUp />
                </Button>
              ) : null}
            </div>
            <div className="flex w-full items-center gap-2 sm:w-auto">
              {searchControl}
              {viewControls}
              {manageControls}
              {repositoryActionControls}
            </div>
          </div>
        ) : null}
        {variant === 'embedded' ? (
          <ScrollArea className="min-h-0 flex-1">
            <div className="pr-4 pb-1">{mediaResults}</div>
          </ScrollArea>
        ) : (
          mediaResults
        )}
        {draggingFiles ? (
          <div className="absolute inset-0 z-20 flex items-center justify-center rounded-xl border-2 border-dashed border-primary bg-background/90 text-sm font-medium">
            Drop files to upload
          </div>
        ) : null}
      </section>

      <DragOverlay dropAnimation={null}>
        {activeDragEntry ? (
          <MediaDragOverlay
            coordinates={coordinates}
            entry={activeDragEntry}
            lease={leases.get(activeDragEntry.path)}
            view={view}
          />
        ) : null}
      </DragOverlay>

      <Dialog open={folderOpen} onOpenChange={setFolderOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New folder</DialogTitle>
            <DialogDescription>
              Create a folder under {directoryPath}.
            </DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor={`${fieldPrefix}-folder`}>
              Folder name
            </FieldLabel>{' '}
            <Input
              id={`${fieldPrefix}-folder`}
              autoFocus
              placeholder="Folder name"
              value={folderName}
              onChange={(event) => setFolderName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && folderName.trim())
                  void createFolder()
              }}
            />
          </Field>
          <DialogFooter showCloseButton>
            <Button
              disabled={creatingFolder || !folderName.trim()}
              onClick={() => void createFolder()}
            >
              Create folder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!renameEntry}
        onOpenChange={(open) => {
          if (!open) setRenameEntry(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename file</DialogTitle>
            <DialogDescription>
              This creates a commit in the repository.
            </DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor={`${fieldPrefix}-filename`}>
              Filename
            </FieldLabel>{' '}
            <Input
              id={`${fieldPrefix}-filename`}
              autoFocus
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && renameValue.trim()) void rename()
              }}
            />
          </Field>
          <DialogFooter showCloseButton>
            <Button
              disabled={renaming || !renameValue.trim()}
              onClick={() => void rename()}
            >
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={!!deleteEntry}
        onOpenChange={(open) => {
          if (!open) setDeleteEntry(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteEntry?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This creates a commit and cannot be undone from Pages CMS.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleting}
              onClick={(event) => {
                event.preventDefault()
                void remove()
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DndContext>
  )
}

export function MediaBrowserSkeleton({ view = 'grid' }: { view?: MediaView }) {
  return view === 'grid' ? (
    <div className={mediaGridClassName}>
      <div className="rounded-md p-2">
        <div className="flex aspect-video items-center justify-center text-muted">
          <Folder
            strokeWidth={2}
            className="size-[clamp(4.5rem,8vw,6rem)] animate-pulse [&>*]:[vector-effect:non-scaling-stroke]"
          />
        </div>
        <Skeleton className="mx-auto mt-2 h-4 w-3/4" />
      </div>
      {Array.from({ length: 9 }, (_, index) => (
        <div className="rounded-md" key={index}>
          <Skeleton className="aspect-video w-full rounded-md" />
          <div className="flex items-start gap-1 pt-2">
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/3" />
            </div>
            <Button
              disabled
              aria-label="File actions"
              size="icon-sm"
              variant="ghost"
            >
              <EllipsisVertical />
            </Button>
          </div>
        </div>
      ))}
    </div>
  ) : (
    <div className="divide-y rounded-xl border">
      {Array.from({ length: 6 }, (_, index) => (
        <div className="flex items-center gap-3 p-2" key={index}>
          <Skeleton className="size-9 rounded-md" />
          <Skeleton className="h-4 w-48" />
        </div>
      ))}
    </div>
  )
}
