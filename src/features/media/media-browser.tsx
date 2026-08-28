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
import { useQuery, useQueryClient } from '@tanstack/react-query'
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
import { ButtonGroup } from '#/components/ui/button-group'
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
        className={cn(
          'flex shrink-0 items-center justify-center',
          variant === 'list' && 'rounded-md border bg-muted',
          className,
        )}
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
      className={cn(
        'flex shrink-0 items-center justify-center',
        variant === 'list' && 'rounded-md border bg-muted',
        className,
      )}
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
  'grid grid-cols-[repeat(auto-fill,minmax(min(100%,9rem),12rem))] justify-start gap-x-4 gap-y-6 sm:gap-x-6 md:gap-x-8 md:gap-y-8'

function DraggableFile({
  entry,
  children,
}: {
  entry: MediaEntry
  children: ReactNode
}) {
  const canDrag = entry.type === 'file' && Boolean(entry.sha)
  const draggable = useDraggable({
    id: entry.path,
    data: { entry },
    disabled: !canDrag,
  })
  return (
    <div
      ref={draggable.setNodeRef}
      style={{ transform: CSS.Translate.toString(draggable.transform) }}
      className={cn(draggable.isDragging && 'z-10 opacity-50')}
      {...(canDrag ? draggable.listeners : undefined)}
    >
      {children}
    </div>
  )
}

function DroppableFolder({
  entry,
  children,
}: {
  entry: MediaEntry
  children: ReactNode
}) {
  const droppable = useDroppable({
    id: entry.path,
    data: { entry },
    disabled: entry.type !== 'dir',
  })
  return (
    <div
      ref={droppable.setNodeRef}
      className={cn(droppable.isOver && 'rounded-lg ring-2 ring-primary')}
    >
      {children}
    </div>
  )
}

function MediaTableRow({
  entry,
  children,
  selected,
}: {
  entry: MediaEntry
  children: ReactNode
  selected: boolean
}) {
  const canDrag = entry.type === 'file' && Boolean(entry.sha)
  const draggable = useDraggable({
    id: entry.path,
    data: { entry },
    disabled: !canDrag,
  })
  const droppable = useDroppable({
    id: entry.path,
    data: { entry },
    disabled: entry.type !== 'dir',
  })
  const setNodeRef = (node: HTMLTableRowElement | null) => {
    draggable.setNodeRef(node)
    droppable.setNodeRef(node)
  }

  return (
    <TableRow
      data-state={selected ? 'selected' : undefined}
      ref={setNodeRef}
      className={cn(
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
  manage,
  onRename,
  onDelete,
}: {
  coordinates: MediaCoordinates
  entry: MediaEntry
  manage: boolean
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
        {manage ? (
          <>
            <DropdownMenuItem onSelect={() => onRename(entry)}>
              Rename
            </DropdownMenuItem>
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
  const query = useQuery(
    mediaQueryOptions({ ...coordinates, path: currentPath }),
  )
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
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  )
  const data = query.data
  const imagePaths = useMemo(
    () =>
      (data?.entries ?? [])
        .filter((entry) => entry.type === 'file' && isImageMedia(entry.path))
        .map((entry) => entry.path),
    [data?.entries],
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
  const renewedFailures = useRef(new Set<string>())
  const requestedPathSet = useRef('')

  useEffect(() => {
    const signature = imagePaths.join('\0')
    if (!signature || requestedPathSet.current === signature) return
    requestedPathSet.current = signature
    if (deliveryQuery.data !== undefined) void deliveryQuery.refetch()
  }, [deliveryQuery.data, deliveryQuery.refetch, imagePaths])

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
      void deliveryQuery.refetch()
    },
    [deliveryQuery.refetch],
  )
  const rootPath = data?.media.rootPath ?? currentPath ?? ''
  const directoryPath = data?.media.path ?? currentPath ?? rootPath
  const visible = useMemo(
    () => mediaEntries(data?.entries ?? [], { search, extensions }),
    [data?.entries, extensions, search],
  )
  const selectedPaths = useMemo(() => new Set(selected), [selected])
  const selecting = Boolean(onSelect || onSelectMany)
  const selectionFull = selecting && selected.length >= selectionLimit

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
    if (!values.length) return
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
    if (!renameEntry?.sha) return
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
    if (!deleteEntry?.sha) return
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
    const entry = event.active.data.current?.entry as MediaEntry | undefined
    const destination = event.over?.data.current?.entry as
      MediaEntry | undefined
    if (!entry?.sha || entry.type !== 'file' || destination?.type !== 'dir')
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
                className="flex min-w-0 items-center gap-3 text-left"
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
                    deliveryQuery.isFetching && !leases.has(entry.path)
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
                coordinates={coordinates}
                entry={row.original}
                manage={manage}
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
    [coordinates, leases, manage, onSelect, selectedPaths],
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
        className="pl-8"
        placeholder="Search media…"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
    </div>
  )
  const viewControls = (
    <ButtonGroup aria-label="Media view">
      <Button
        aria-label="Grid view"
        aria-pressed={view === 'grid'}
        size="icon"
        variant={view === 'grid' ? 'secondary' : 'outline'}
        onClick={() => setView('grid')}
      >
        <Grid2X2 />
      </Button>
      <Button
        aria-label="List view"
        aria-pressed={view === 'list'}
        size="icon"
        variant={view === 'list' ? 'secondary' : 'outline'}
        onClick={() => setView('list')}
      >
        <List />
      </Button>
    </ButtonGroup>
  )
  const manageControls = manage ? (
    <>
      <Button
        aria-label="New folder"
        disabled={busy}
        size="icon"
        variant="outline"
        onClick={() => setFolderOpen(true)}
      >
        <FolderPlus />
      </Button>
      <Button asChild disabled={busy || selectionFull}>
        <label>
          {busy ? <LoaderCircle className="animate-spin" /> : <Upload />} Upload
          <input
            multiple
            className="sr-only"
            disabled={busy || selectionFull}
            type="file"
            accept={extensions?.map((value) => `.${value}`).join(',')}
            onChange={(event) => {
              void upload(event.target.files ?? [])
              event.target.value = ''
            }}
          />
        </label>
      </Button>
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
              path={data.media.path}
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
            manage &&
            !selectionFull &&
            event.dataTransfer.types.includes('Files')
          ) {
            event.preventDefault()
            setDraggingFiles(true)
          }
        }}
        onDragOver={(event) => {
          if (
            manage &&
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
          if (!manage || selectionFull || !event.dataTransfer.files.length)
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
        <OperationError
          error={error ?? query.error ?? deliveryQuery.error}
          fallback="Could not load media."
        />
        {query.isPending ? (
          <MediaBrowserSkeleton view={view} />
        ) : visible.length ? (
          view === 'grid' ? (
            <div className={mediaGridClassName}>
              {visible.map((entry) => (
                <DroppableFolder entry={entry} key={entry.path}>
                  <DraggableFile entry={entry}>
                    <div
                      className={cn(
                        'relative rounded-md',
                        selectedPaths.has(entry.path) &&
                          'ring-2 ring-ring ring-offset-2 ring-offset-background',
                      )}
                    >
                      {entry.type === 'dir' ? (
                        <button
                          className="block w-full rounded-md p-2 text-center outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
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
                            aria-pressed={selectedPaths.has(entry.path)}
                            className="block w-full rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-default"
                            disabled={!onSelect}
                            type="button"
                            onClick={() => onSelect?.(entry.path)}
                          >
                            <EntryPreview
                              coordinates={coordinates}
                              entry={entry}
                              className="aspect-video w-full"
                              source={leases.get(entry.path)?.url}
                              loadingSource={
                                deliveryQuery.isFetching &&
                                !leases.has(entry.path)
                              }
                              onSourceError={renewFailedLease}
                              variant="grid"
                            />
                          </button>
                          <div className="flex min-w-0 items-start gap-1 pt-2">
                            <button
                              aria-pressed={selectedPaths.has(entry.path)}
                              className="min-w-0 flex-1 text-left outline-none disabled:cursor-default"
                              disabled={!onSelect}
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
                              coordinates={coordinates}
                              entry={entry}
                              manage={manage}
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
