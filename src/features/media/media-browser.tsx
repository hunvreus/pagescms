import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
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
  List,
  LoaderCircle,
  Search,
  Upload,
} from 'lucide-react'

import { MediaThumbnail } from '#/components/media-thumbnail'
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
import { queryKeys } from '#/queries/keys'

import {
  formatMediaSize,
  isImageMedia,
  mediaLeaseRenewalDelay,
  mediaEntries,
  needsMediaDeliveryRefetch,
  parentMediaPath,
} from './media-model'
import { uploadMediaFiles } from './media-upload'

import type { DragEndEvent } from '@dnd-kit/core'
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
          className={cn(
            'text-muted-foreground',
            variant === 'grid'
              ? 'size-[clamp(4.5rem,8vw,6rem)] stroke-[0.75]'
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
        className={cn(
          'text-muted-foreground',
          variant === 'grid'
            ? 'size-[clamp(4.5rem,8vw,6rem)] stroke-[0.75]'
            : 'size-5',
        )}
      />
    </span>
  )
}

const mediaGridClassName =
  'grid grid-cols-[repeat(auto-fill,minmax(min(100%,9rem),12rem))] justify-center gap-x-4 gap-y-6 sm:gap-x-6 md:gap-x-8 md:gap-y-8'

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
      style={{ transform: CSS.Translate.toString(draggable.transform) }}
      className={cn(
        canDrag && 'cursor-grab',
        draggable.isDragging && 'z-10 cursor-grabbing opacity-50',
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
        draggable.isDragging && 'z-10 opacity-50',
        droppable.isOver && 'ring-2 ring-inset ring-primary',
      )}
      style={{ transform: CSS.Translate.toString(draggable.transform) }}
      {...(canDrag ? draggable.listeners : undefined)}
    >
      {children}
    </TableRow>
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
      <DropdownMenuContent align="end" className="min-w-40">
        <DropdownMenuItem asChild>
          <a
            href={githubUrl(coordinates, entry.path)}
            rel="noreferrer"
            target="_blank"
          >
            View on GitHub <ArrowUpRight className="ml-auto opacity-50" />
          </a>
        </DropdownMenuItem>
        {canRename ? (
          <DropdownMenuItem onSelect={() => onRename(entry)}>
            Rename
          </DropdownMenuItem>
        ) : null}
        {canDelete ? (
          <>
            <DropdownMenuSeparator />
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
  title = false,
}: {
  label: string
  rootPath: string
  path: string
  onNavigate: (path: string) => void
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
    <Breadcrumb>
      <BreadcrumbList className={cn(title && 'text-lg font-medium')}>
        <BreadcrumbItem>
          {entries.length ? (
            <BreadcrumbLink asChild className={cn(title && 'font-medium')}>
              <button type="button" onClick={() => onNavigate(rootPath)}>
                {label}
              </button>
            </BreadcrumbLink>
          ) : (
            <BreadcrumbPage className={cn(title && 'font-medium')}>
              {label}
            </BreadcrumbPage>
          )}
        </BreadcrumbItem>
        {entries.map((entry, index) => {
          const current = index === entries.length - 1
          return (
            <Fragment key={entry.path}>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                {current ? (
                  <BreadcrumbPage className={cn(title && 'font-medium')}>
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
  const queryClient = useQueryClient()
  const [localPath, setLocalPath] = useState(path)
  const currentPath = path ?? localPath
  const query = useQuery({
    ...mediaQueryOptions({ ...coordinates, path: currentPath }),
    placeholderData: keepPreviousData,
  })
  const [search, setSearch] = useState('')
  const [view, setView] = useState<MediaView>('grid')
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  const [folderOpen, setFolderOpen] = useState(false)
  const [folderName, setFolderName] = useState('')
  const [renameEntry, setRenameEntry] = useState<MediaEntry | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deleteEntry, setDeleteEntry] = useState<MediaEntry | null>(null)
  const [draggingFiles, setDraggingFiles] = useState(false)
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
  const entries = folderPending ? [] : (data?.entries ?? [])
  const imagePaths = useMemo(
    () =>
      entries
        .filter((entry) => entry.type === 'file' && isImageMedia(entry.path))
        .map((entry) => entry.path),
    [entries],
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
  const rootPath = data?.media.rootPath ?? currentPath ?? ''
  const directoryPath = query.isPlaceholderData
    ? (currentPath ?? rootPath)
    : (data?.media.path ?? currentPath ?? rootPath)
  const visible = useMemo(
    () => mediaEntries(entries, { search, extensions }),
    [entries, extensions, search],
  )
  const selectedPaths = useMemo(() => new Set(selected), [selected])
  const selecting = Boolean(onSelect || onSelectMany)
  const selectionFull = selecting && selected.length >= selectionLimit
  const canCreateDirectory =
    manage && Boolean(data?.media.capabilities.createDirectory)
  const canUpload = manage && Boolean(data?.media.capabilities.upload)
  const canMove = manage && Boolean(data?.media.capabilities.move)
  const canRename = manage && Boolean(data?.media.capabilities.rename)
  const canDelete = manage && Boolean(data?.media.capabilities.remove)
  const controlsDisabled = busy || folderPending

  function navigate(next: string) {
    setSearch('')
    if (onPathChange) onPathChange(next)
    else setLocalPath(next)
  }

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: queryKeys.media(coordinates),
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.mediaDelivery(coordinates),
      }),
    ])
  }

  async function upload(files: FileList | File[]) {
    const values = Array.from(files)
    if (!canUpload || !values.length) return
    setBusy(true)
    setError(null)
    try {
      const remaining = selecting
        ? Math.max(0, selectionLimit - selected.length)
        : undefined
      if (remaining === 0) throw new Error('Selection limit reached')
      const uploaded = await uploadMediaFiles({
        coordinates,
        extensions,
        files: values,
        limit: remaining,
        path: directoryPath,
      })
      if (onSelectMany) onSelectMany(uploaded)
      else if (onSelect) uploaded.forEach(onSelect)
      await refresh()
    } catch (cause) {
      setError(cause)
    } finally {
      setBusy(false)
      setDraggingFiles(false)
    }
  }

  async function createFolder() {
    if (!canCreateDirectory) return
    setBusy(true)
    setError(null)
    try {
      await createMediaFolder({
        data: { ...coordinates, path: directoryPath, folder: folderName },
      })
      setFolderName('')
      setFolderOpen(false)
      await refresh()
    } catch (cause) {
      setError(cause)
    } finally {
      setBusy(false)
    }
  }

  async function rename() {
    if (!canRename || !renameEntry?.sha) return
    setBusy(true)
    setError(null)
    try {
      await renameMedia({
        data: {
          ...coordinates,
          path: renameEntry.path,
          sha: renameEntry.sha,
          filename: renameValue,
        },
      })
      setRenameEntry(null)
      await refresh()
    } catch (cause) {
      setError(cause)
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!canDelete || !deleteEntry?.sha) return
    setBusy(true)
    setError(null)
    try {
      await removeMedia({
        data: { ...coordinates, path: deleteEntry.path, sha: deleteEntry.sha },
      })
      setDeleteEntry(null)
      await refresh()
    } catch (cause) {
      setError(cause)
    } finally {
      setBusy(false)
    }
  }

  async function move(event: DragEndEvent) {
    // TODO(media): Support directory rename/move. GitHub can reattach an
    // existing tree SHA atomically; S3/R2 require prefix copy/delete with
    // progress and partial-failure handling.
    const entry = event.active.data.current?.entry as MediaEntry | undefined
    const destination = event.over?.data.current?.entry as
      MediaEntry | undefined
    if (
      !canMove ||
      !entry?.sha ||
      entry.type !== 'file' ||
      destination?.type !== 'dir'
    )
      return
    setBusy(true)
    setError(null)
    try {
      await moveMedia({
        data: {
          ...coordinates,
          path: entry.path,
          sha: entry.sha,
          destination: destination.path,
        },
      })
      await refresh()
    } catch (cause) {
      setError(cause)
    } finally {
      setBusy(false)
    }
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
                  entry.type === 'dir'
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
          header: 'Actions',
          cell: ({ row }) => (
            <div className="flex justify-end">
              <EntryActions
                canDelete={canDelete}
                canRename={canRename}
                coordinates={coordinates}
                entry={row.original}
                onDelete={setDeleteEntry}
                onRename={(entry) => {
                  setRenameEntry(entry)
                  setRenameValue(entry.name)
                }}
              />
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
        if (value === 'grid' || value === 'list') setView(value)
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
              disabled={controlsDisabled || selectionFull || !canUpload}
              onClick={() => uploadInputRef.current?.click()}
            >
              {busy ? <LoaderCircle className="animate-spin" /> : <Upload />}{' '}
              Upload
            </Button>
            <input
              multiple
              className="sr-only"
              disabled={controlsDisabled || selectionFull || !canUpload}
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

  return (
    <DndContext sensors={sensors} onDragEnd={(event) => void move(event)}>
      {variant === 'page' ? (
        <RepositoryPageHeader
          refreshing={query.isFetching}
          actions={
            <>
              {searchControl}
              {viewControls}
              {manageControls}
              {data ? (
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
              ) : null}
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
          'relative space-y-4',
          variant === 'page' && 'p-4 md:p-6',
          className,
        )}
        onDragEnter={(event) => {
          if (
            canUpload &&
            !selectionFull &&
            event.dataTransfer.types.includes('Files')
          ) {
            event.preventDefault()
            setDraggingFiles(true)
          }
        }}
        onDragOver={(event) => {
          if (
            canUpload &&
            !selectionFull &&
            event.dataTransfer.types.includes('Files')
          )
            event.preventDefault()
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node))
            setDraggingFiles(false)
        }}
        onDrop={(event) => {
          if (!canUpload || selectionFull || !event.dataTransfer.files.length)
            return
          event.preventDefault()
          void upload(event.dataTransfer.files)
        }}
      >
        {variant === 'embedded' ? (
          <>
            {showBreadcrumb ? (
              <MediaBreadcrumb
                label={data?.media.label ?? rootPath}
                path={directoryPath}
                rootPath={rootPath}
                onNavigate={navigate}
              />
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              {directoryPath !== rootPath ? (
                <Button
                  aria-label="Parent folder"
                  size="icon"
                  variant="outline"
                  onClick={() =>
                    navigate(parentMediaPath(directoryPath, rootPath))
                  }
                >
                  <ArrowUp />
                </Button>
              ) : null}
              {searchControl}
              <div className="ml-auto flex items-center gap-2">
                {viewControls}
                {manageControls}
              </div>
            </div>
          </>
        ) : null}
        <OperationError error={error} fallback="Could not update media." />
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
            <div className={mediaGridClassName}>
              {visible.map((entry) => (
                <DroppableFolder
                  canMove={canMove}
                  entry={entry}
                  key={entry.path}
                >
                  <DraggableFile canMove={canMove} entry={entry}>
                    <div
                      className={cn(
                        'relative rounded-md',
                        selectedPaths.has(entry.path) &&
                          'ring-2 ring-ring ring-offset-2 ring-offset-background',
                      )}
                    >
                      {entry.type === 'dir' ? (
                        <button
                          className="block w-full cursor-pointer rounded-md p-2 text-center outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                          type="button"
                          onClick={() => navigate(entry.path)}
                        >
                          <EntryPreview
                            coordinates={coordinates}
                            entry={entry}
                            className="aspect-video w-full"
                            variant="grid"
                          />
                          <span className="mt-2 block truncate text-sm font-medium">
                            {entry.name}
                          </span>
                        </button>
                      ) : (
                        <>
                          <button
                            aria-disabled={!onSelect}
                            aria-pressed={selectedPaths.has(entry.path)}
                            className="block w-full rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                            tabIndex={onSelect ? undefined : -1}
                            type="button"
                            onClick={() => onSelect?.(entry.path)}
                          >
                            <EntryPreview
                              coordinates={coordinates}
                              entry={entry}
                              className="aspect-video w-full"
                              source={leases.get(entry.path)?.url}
                              loadingSource={
                                (!leases.has(entry.path) &&
                                  !deliveryQuery.isError) ||
                                renewingSources.has(
                                  leases.get(entry.path)?.url ?? '',
                                )
                              }
                              onSourceError={renewFailedLease}
                              variant="grid"
                            />
                          </button>
                          <div className="flex min-w-0 items-start gap-1 pt-2">
                            <button
                              aria-disabled={!onSelect}
                              aria-pressed={selectedPaths.has(entry.path)}
                              className="min-w-0 flex-1 text-left outline-none"
                              tabIndex={onSelect ? undefined : -1}
                              type="button"
                              onClick={() => onSelect?.(entry.path)}
                            >
                              <span className="block truncate text-sm font-medium">
                                {entry.name}
                              </span>
                              <span className="block truncate text-xs text-muted-foreground">
                                {formatMediaSize(entry.size)}
                              </span>
                            </button>
                            <EntryActions
                              canDelete={canDelete}
                              canRename={canRename}
                              coordinates={coordinates}
                              entry={entry}
                              onDelete={setDeleteEntry}
                              onRename={(value) => {
                                setRenameEntry(value)
                                setRenameValue(value.name)
                              }}
                            />
                          </div>
                        </>
                      )}
                      {entry.type === 'file' &&
                      selectedPaths.has(entry.path) ? (
                        <span className="absolute top-2 left-2 rounded-full bg-primary p-0.5 text-primary-foreground">
                          <Check className="size-3 stroke-3" />
                        </span>
                      ) : null}
                    </div>
                  </DraggableFile>
                </DroppableFolder>
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  {mediaTable.getHeaderGroups()[0]?.headers.map((header) => (
                    <TableHead
                      className={
                        header.column.id === 'actions'
                          ? 'text-right'
                          : undefined
                      }
                      key={header.id}
                    >
                      {header.isPlaceholder ? null : (
                        <mediaTable.FlexRender header={header} />
                      )}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {mediaTable.getRowModel().rows.map((row) => (
                  <MediaTableRow
                    canMove={canMove}
                    entry={row.original}
                    key={row.id}
                    selected={selectedPaths.has(row.original.path)}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        className={
                          cell.column.id === 'actions'
                            ? 'text-right'
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
        ) : (
          <Empty className="min-h-64 border">
            <EmptyHeader>
              <EmptyTitle>
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
        )}
        {draggingFiles ? (
          <div className="absolute inset-0 z-20 flex items-center justify-center rounded-xl border-2 border-dashed border-primary bg-background/90 text-sm font-medium">
            Drop files to upload
          </div>
        ) : null}
      </section>

      <Dialog open={folderOpen} onOpenChange={setFolderOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New folder</DialogTitle>
            <DialogDescription>
              Create a folder under {directoryPath}.
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            placeholder="Folder name"
            value={folderName}
            onChange={(event) => setFolderName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && folderName.trim())
                void createFolder()
            }}
          />
          <DialogFooter showCloseButton>
            <Button
              disabled={busy || !folderName.trim()}
              onClick={() => void createFolder()}
            >
              {busy ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <FolderPlus />
              )}{' '}
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
          <Input
            autoFocus
            value={renameValue}
            onChange={(event) => setRenameValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && renameValue.trim()) void rename()
            }}
          />
          <DialogFooter showCloseButton>
            <Button
              disabled={busy || !renameValue.trim()}
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
              onClick={() => void remove()}
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
          <Folder className="size-[clamp(4.5rem,8vw,6rem)] animate-pulse stroke-[0.75]" />
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
