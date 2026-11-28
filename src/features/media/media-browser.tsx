import {
  useLingui as useUiMessages,
  Trans as UiTrans,
} from '@lingui/react/macro'

import { LoadError } from '#/components/operation-error'
import { accessDenialFrom, userFacingError } from '#/lib/access-denial'
import { HugeiconsIcon } from '@hugeicons/react'
import { Spinner } from '#/components/ui/spinner'
import { repositoryRequest } from '#/lib/repository-identity'
import { Field, FieldLabel } from '#/components/ui/field'
import {
  completeMediaUpload,
  isCopyConflict,
  mediaParent,
  mediaRows,
  patchMedia,
  refreshMedia,
  useMediaJobs,
  useMediaMutation,
} from './media-mutations'
import { accountIsActive } from '#/features/pending-writes/account-operation'
import { authenticationQueryOptions } from '#/client/queries/session'
import { readMediaView, saveMediaView } from './media-view'
import {
  startTransition,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import { DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import ArrowUp from '@hugeicons/core-free-icons/ArrowUp02Icon'
import FolderPlus from '@hugeicons/core-free-icons/FolderPlusIcon'
import Grid2X2 from '@hugeicons/core-free-icons/Grid2x2Icon'
import List from '@hugeicons/core-free-icons/ListIcon'
import { SearchInput } from '#/components/search-input'
import Upload from '@hugeicons/core-free-icons/Upload01Icon'

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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
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
  TableErrorRow,
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
} from '#/client/api/media'
import { cn } from 'cn'
import { mediaQueryOptions } from '#/client/queries/content'
import { repositoryQueryOptions } from '#/client/queries/repository'
import { findMediaSchema } from '#/shared/configuration-content'

import { MediaBreadcrumb } from './media-breadcrumb'
import { MediaBrowserSkeleton, mediaGridClassName } from './media-skeleton'
import { MediaMoveDialog } from './media-move-dialog'
import { MediaDragOverlay } from './media-drag-overlay'
import { MediaGridEntry, MediaTableRow } from './media-entry'
import { mediaEntries, parentMediaPath } from './media-model'
import { MediaUploadError, uploadMediaFiles } from './media-upload'

import type { CollisionDetection, DragEndEvent } from '@dnd-kit/core'
import type { MediaEntry, MediaView } from './media-model'

export interface MediaCoordinates {
  repoId?: string
  source?: string
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

const pointerSensorOptions = { activationConstraint: { distance: 8 } }

// A sticky breadcrumb can cover a folder. Only the visible target accepts the drop.
const mediaDropTarget: CollisionDetection = ({
  pointerCoordinates,
  droppableContainers,
}) => {
  if (!pointerCoordinates) return []
  const hit = document.elementFromPoint(
    pointerCoordinates.x,
    pointerCoordinates.y,
  )
  const target = droppableContainers.find(({ node }) =>
    node.current?.contains(hit),
  )
  return target ? [{ id: target.id }] : []
}

function MediaViewControls({
  initialView,
  disabled,
  onChange,
}: {
  initialView: MediaView
  disabled: boolean
  onChange: (view: MediaView) => void
}) {
  const { t: _t } = useUiMessages()
  const [selectedView, setSelectedView] = useState(initialView)
  const itemClassName =
    'text-muted-foreground hover:text-foreground data-[state=off]:hover:bg-transparent data-[state=on]:text-foreground'
  return (
    <ToggleGroup
      aria-label={_t({ message: 'Media view' })}
      spacing={0}
      type="single"
      value={selectedView}
      variant="outline"
      onValueChange={(value) => {
        if (value !== 'grid' && value !== 'list') return
        setSelectedView(value)
        startTransition(() => onChange(value))
        try {
          saveMediaView(value)
        } catch {
          // Keep the selected view for this session when storage is unavailable.
        }
      }}
    >
      <ToggleGroupItem
        aria-label={_t({ message: 'Grid view' })}
        className={itemClassName}
        disabled={disabled}
        value="grid"
      >
        <HugeiconsIcon aria-hidden="true" icon={Grid2X2} />
      </ToggleGroupItem>
      <ToggleGroupItem
        aria-label={_t({ message: 'List view' })}
        className={itemClassName}
        disabled={disabled}
        value="list"
      >
        <HugeiconsIcon aria-hidden="true" icon={List} />
      </ToggleGroupItem>
    </ToggleGroup>
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
  const { t: _t, i18n: mediaI18n } = useUiMessages()

  const fieldPrefix = useId()
  const queryClient = useQueryClient()
  const resultsRef = useRef<HTMLDivElement>(null)
  const dialogFilePath = useRef<string | null>(null)
  const [localPath, setLocalPath] = useState(path)
  const currentPath = path ?? localPath
  const query = useQuery({
    ...mediaQueryOptions({ ...coordinates, path: currentPath }),
    placeholderData: keepPreviousData,
  })
  const [search, setSearch] = useState('')
  const [view, setView] = useState<MediaView>(readMediaView)
  const [pagination, setPagination] = useState({ scope: '', page: 0 })
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
  const [moveEntry, setMoveEntry] = useState<MediaEntry | null>(null)
  const uploadInputRef = useRef<HTMLInputElement>(null)
  const sensors = useSensors(useSensor(PointerSensor, pointerSensorOptions))
  const data = query.data
  const folderPending = query.isPending || query.isPlaceholderData
  const manifestUnavailable = query.isError && !data
  const repository = queryClient.getQueryData(
    repositoryQueryOptions(coordinates).queryKey,
  )
  const configuredMedia = repository?.configuration?.object
    ? findMediaSchema(repository.configuration.object, coordinates.name)
    : undefined
  const configuredLabel =
    typeof configuredMedia?.label === 'string' && configuredMedia.label
      ? configuredMedia.label
      : undefined
  const rootPath =
    data?.media.rootPath ?? configuredMedia?.input ?? currentPath ?? ''
  const mediaDenial = accessDenialFrom(query.error)
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
        result.set(`__pending__/${job.id}`, _t({ message: 'Creating…' }))
      if (job.kind === 'upload')
        job.files?.forEach((_file, index) => {
          if (!operations.completed[job.id]?.includes(index))
            result.set(
              `__pending__/${job.id}/${index}`,
              _t({ message: 'Uploading…' }),
            )
        })
      if (job.entry)
        result.set(
          job.entry.path,
          job.kind === 'rename'
            ? _t({ message: 'Renaming…' })
            : _t({ message: 'Moving…' }),
        )
    }
    return result
  }, [pendingJobs, operations.completed, mediaI18n])
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
  const visible = useMemo(
    () => mediaEntries(entries, { search, extensions }),
    [entries, extensions, search],
  )
  const pageScope = JSON.stringify([directoryPath, search, extensions, view])
  const pageCount = Math.max(1, Math.ceil(visible.length / 100))
  const page = Math.min(
    pagination.scope === pageScope ? pagination.page : 0,
    pageCount - 1,
  )
  const pageEntries = visible.slice(page * 100, (page + 1) * 100)
  const changePage = (next: number) => {
    setPagination({ scope: pageScope, page: next })
    resultsRef.current?.scrollIntoView({ block: 'start' })
  }
  const selectedPaths = new Set(selected)
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

  const navigate = useCallback(
    (next: string) => {
      setSearch('')
      setFolderOpen(false)
      setRenameEntry(null)
      setDeleteEntry(null)
      setMoveEntry(null)
      if (onPathChange) onPathChange(next)
      else setLocalPath(next)
    },
    [onPathChange],
  )

  const openRename = useCallback((entry: MediaEntry) => {
    dialogFilePath.current = entry.path
    setRenameEntry(entry)
    setRenameValue(entry.name)
  }, [])

  const openMove = useCallback((entry: MediaEntry) => {
    dialogFilePath.current = entry.path
    setMoveEntry(entry)
  }, [])

  const openDelete = useCallback((entry: MediaEntry) => {
    dialogFilePath.current = entry.path
    setDeleteEntry(entry)
  }, [])

  function restoreFileFocus(event: Event) {
    const filePath = dialogFilePath.current
    const results = resultsRef.current
    if (!filePath || !results) return
    dialogFilePath.current = null
    event.preventDefault()
    const trigger = results.querySelector<HTMLButtonElement>(
      `[data-media-path="${CSS.escape(filePath)}"] button[aria-haspopup="menu"]`,
    )
    const target = trigger ?? results
    target.focus({ preventScroll: true })
  }

  function sameView(origin: string) {
    return mounted.current && currentView.current === origin
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
    const active = accountIsActive(queryClient, account)
    const id = crypto.randomUUID()
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
            notificationId: id,
            coordinates: repositoryRequest(coordinates),
            extensions,
            isActive: active,
            files: values,
            path: directoryPath,
            onUploaded: (result, file, index) => {
              if (!active()) return
              patchMedia(
                queryClient,
                coordinates,
                [],
                confirmedMediaEntry(result, undefined, file),
              )
              completeMediaUpload(queryClient, account, id, index)
            },
          }),
        confirmed: (paths, isActive) => {
          if (!isActive()) return
          refreshMedia(queryClient, coordinates, [directoryPath])
          if (sameView(origin)) {
            if (onSelectMany) onSelectMany(paths)
            else if (onSelect) paths.forEach(onSelect)
          }
        },
      })
    } catch (cause) {
      if (sameView(origin) && active()) {
        if (cause instanceof MediaUploadError && cause.paths.length) {
          if (onSelectMany) onSelectMany(cause.paths)
          else if (onSelect) cause.paths.forEach(onSelect)
        }
      }
      if (active()) refreshMedia(queryClient, coordinates, [directoryPath])
    }
  }
  async function createFolder() {
    const filename = folderName.trim()
    if (!canCreateDirectory || !filename || creatingFolder) return
    const origin = currentView.current
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
            ...repositoryRequest(coordinates),
            path: directoryPath,
            folder: filename,
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
      // The media action boundary reports this failure.
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
            ...repositoryRequest(coordinates),
            path: entry.path,
            sha: entry.sha!,
            filename,
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
          if (sameView(origin) && dialogFilePath.current === entry.path) {
            dialogFilePath.current = result.path
            setRenameEntry(null)
          }
        },
      })
    } catch (cause) {
      if (
        isCopyConflict(cause, { kind: 'rename', destination }) &&
        sameView(origin)
      )
        setRenameEntry((current) => (current === entry ? null : current))
    }
  }
  async function remove() {
    const entry = deleteEntry
    if (!canDelete || !entry?.sha || deleting) return
    const origin = currentView.current
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
            ...repositoryRequest(coordinates),
            path: entry.path,
            sha: entry.sha!,
          }),
        confirmed: (_result, active) => {
          if (!active()) return
          patchMedia(queryClient, coordinates, [entry.path])
          refreshMedia(queryClient, coordinates, [directoryPath])
          if (sameView(origin)) setDeleteEntry(null)
        },
      })
    } catch (cause) {
      // The media action boundary reports this failure.
    }
  }
  async function move(entry: MediaEntry, destination: string) {
    const sourceDirectory = mediaParent(entry.path)
    if (
      !canMove ||
      !entry.sha ||
      entry.type !== 'file' ||
      destination === sourceDirectory ||
      pending.has(entry.path) ||
      pending.has(destination)
    )
      return
    const newPath = [destination, entry.name].filter(Boolean).join('/')
    const origin = currentView.current
    try {
      await moveMutation.run({
        id: crypto.randomUUID(),
        coordinates,
        kind: 'move',
        directory: sourceDirectory,
        entry,
        destination: newPath,
        paths: [entry.path, newPath],
        run: () =>
          moveMedia({
            ...repositoryRequest(coordinates),
            path: entry.path,
            sha: entry.sha!,
            destination,
          }),
        confirmed: (result, active) => {
          if (!active()) return
          patchMedia(
            queryClient,
            coordinates,
            [entry.path],
            confirmedMediaEntry(result, entry),
          )
          refreshMedia(queryClient, coordinates, [sourceDirectory, destination])
          if (sameView(origin))
            setMoveEntry((current) => (current === entry ? null : current))
        },
      })
    } catch (cause) {
      if (
        isCopyConflict(cause, { kind: 'move', destination: newPath }) &&
        sameView(origin)
      )
        setMoveEntry((current) => (current === entry ? null : current))
    }
  }

  function dropFile({ active, over }: DragEndEvent) {
    const entry = active.data.current?.entry as MediaEntry | undefined
    const destination = over?.data.current?.destination
    if (entry && typeof destination === 'string') void move(entry, destination)
  }

  function entryProps(entry: MediaEntry) {
    return {
      coordinates,
      provider: data?.media.provider,
      entry,
      pending: pending.get(entry.path),
      selected: selectedPaths.has(entry.path),
      canMove,
      canRename,
      canDelete,
      onNavigate: navigate,
      onSelect,
      onRename: openRename,
      onMove: openMove,
      onDelete: openDelete,
    }
  }

  const searchControl = (
    <SearchInput
      aria-label={_t({ message: 'Search media…' })}
      disabled={folderPending}
      placeholder={_t({ message: 'Search media…' })}
      value={search}
      onChange={(event) => setSearch(event.target.value)}
    />
  )
  const viewControls = (
    <MediaViewControls
      initialView={view}
      disabled={folderPending}
      onChange={setView}
    />
  )
  const showPendingManageControls = manage && !data
  const manageControls =
    canCreateDirectory || canUpload || showPendingManageControls ? (
      <>
        {canCreateDirectory || showPendingManageControls ? (
          <Button
            aria-label={_t({ message: 'New folder' })}
            disabled={folderPending || !canCreateDirectory}
            size="icon"
            variant="outline"
            onClick={() => setFolderOpen(true)}
          >
            <HugeiconsIcon aria-hidden="true" icon={FolderPlus} />
          </Button>
        ) : null}
        {canUpload || showPendingManageControls ? (
          <>
            <Button
              aria-label={_t({ message: 'Upload' })}
              className={
                variant === 'page'
                  ? 'max-md:size-8 max-md:p-0 max-md:has-data-[icon=inline-start]:pl-0 max-md:has-data-[icon=inline-end]:pr-0'
                  : undefined
              }
              aria-busy={uploading}
              disabled={folderPending || !canUpload || uploading}
              onClick={() => uploadInputRef.current?.click()}
            >
              <HugeiconsIcon
                aria-hidden="true"
                icon={Upload}
                className={
                  uploading && variant === 'page' ? 'max-md:hidden' : undefined
                }
                data-icon="inline-start"
              />
              <span
                className={variant === 'page' ? 'hidden md:inline' : undefined}
              >
                <UiTrans>Upload</UiTrans>
              </span>
              {uploading ? (
                <Spinner aria-hidden="true" data-icon="inline-end" />
              ) : null}
            </Button>
            <input
              multiple
              className="sr-only"
              disabled={folderPending || !canUpload || uploading}
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
          <TableHead>
            <UiTrans>Name</UiTrans>
          </TableHead>
          <TableHead>
            <UiTrans>Size</UiTrans>
          </TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {!visible.length && !query.error ? (
          <TableRow className="hover:bg-transparent">
            <TableCell
              colSpan={3}
              className="text-center text-muted-foreground"
            >
              {search
                ? _t({ message: 'No matching media.' })
                : _t({ message: 'No media yet.' })}
            </TableCell>
          </TableRow>
        ) : null}
        {pageEntries.map((entry) => (
          <MediaTableRow key={entry.path} {...entryProps(entry)} />
        ))}
        {query.error ? (
          <TableErrorRow
            colSpan={3}
            message={
              data
                ? _t({
                    message:
                      'Could not refresh media. The displayed results may be out of date.',
                  })
                : _t({ message: 'Could not load media.' })
            }
            onRetry={() => void query.refetch()}
            retrying={query.isFetching}
          />
        ) : null}
      </TableBody>
    </Table>
  )
  const emptyResults = (
    <Empty className="min-h-64">
      <EmptyHeader>
        <EmptyTitle>
          {search
            ? _t({ message: 'No matching media' })
            : _t({ message: 'No media yet' })}
        </EmptyTitle>
        <EmptyDescription>
          {search
            ? _t({ message: 'Try a different search.' })
            : _t({
                message: 'Upload a file or create a folder to get started.',
              })}
        </EmptyDescription>
      </EmptyHeader>
      {search ? (
        <EmptyContent>
          <Button size="sm" variant="outline" onClick={() => setSearch('')}>
            <UiTrans>Clear search</UiTrans>
          </Button>
        </EmptyContent>
      ) : null}
    </Empty>
  )
  const gridResults = (
    <div className={mediaGridClassName}>
      {pageEntries.map((entry) => (
        <MediaGridEntry key={entry.path} {...entryProps(entry)} />
      ))}
    </div>
  )
  const centerEmptyGrid =
    view === 'grid' &&
    (manifestUnavailable ||
      (!folderPending && Boolean(data) && !visible.length))
  const mediaResults = (
    <div
      ref={resultsRef}
      role="region"
      aria-label={_t({ message: 'Media' })}
      tabIndex={-1}
      className={cn(
        variant === 'page' && 'scroll-mt-16',
        centerEmptyGrid && 'flex min-h-0 flex-1 flex-col',
      )}
      aria-busy={query.isFetching}
      inert={query.isPlaceholderData}
    >
      {query.error && data && view !== 'list' ? (
        <LoadError
          error={query.error}
          message={_t({ message: 'Could not refresh media.' })}
          stale
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : null}
      {manifestUnavailable ? (
        view === 'list' ? (
          tableResults
        ) : (
          <Empty role="alert" className="min-h-64">
            <EmptyHeader>
              <EmptyTitle>
                <UiTrans>Could not load media</UiTrans>
              </EmptyTitle>
              <EmptyDescription>
                {mediaDenial
                  ? userFacingError(query.error, '', mediaI18n)
                  : _t({ message: 'Please try again.' })}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              {mediaDenial?.actionUrl ? (
                <Button asChild size="sm" variant="outline">
                  <a href={mediaDenial.actionUrl} rel="noreferrer">
                    <UiTrans>Learn more</UiTrans>
                  </a>
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  aria-busy={query.isFetching}
                  disabled={query.isFetching}
                  onClick={() => void query.refetch()}
                >
                  <UiTrans>Try again</UiTrans>
                  {query.isFetching ? (
                    <Spinner aria-hidden="true" data-icon="inline-end" />
                  ) : null}
                </Button>
              )}
            </EmptyContent>
          </Empty>
        )
      ) : folderPending || !data ? (
        <MediaBrowserSkeleton view={view} />
      ) : view === 'list' ? (
        tableResults
      ) : visible.length ? (
        gridResults
      ) : (
        emptyResults
      )}
      {!folderPending && !manifestUnavailable && pageCount > 1 ? (
        <nav
          aria-label={_t({ message: 'Media pagination' })}
          className="mt-4 flex items-center justify-between gap-2"
        >
          <span className="text-sm text-muted-foreground">
            {page * 100 + 1}–{Math.min((page + 1) * 100, visible.length)}{' '}
            <UiTrans>of</UiTrans> {visible.length}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => changePage(page - 1)}
            >
              <UiTrans>Previous</UiTrans>
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page === pageCount - 1}
              onClick={() => changePage(page + 1)}
            >
              <UiTrans>Next</UiTrans>
            </Button>
          </div>
        </nav>
      ) : null}
    </div>
  )

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={mediaDropTarget}
      onDragEnd={dropFile}
    >
      {variant === 'page' ? (
        <RepositoryPageHeader
          className="shrink-0"
          refreshing={query.isFetching}
          toolbar={searchControl}
          actions={
            <>
              {viewControls}
              {manageControls}
              {repositoryActionControls}
            </>
          }
        >
          {data || manifestUnavailable ? (
            <MediaBreadcrumb
              title
              label={
                data?.media.defaultLabel ||
                (!data && !configuredLabel && coordinates.name === 'default')
                  ? _t({ message: 'Media' })
                  : (data?.media.label ?? configuredLabel ?? coordinates.name)
              }
              path={directoryPath}
              rootPath={rootPath}
              onNavigate={navigate}
              allowDrop={canMove}
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
            ? 'flex min-h-0 flex-1 flex-col gap-4 p-4 md:p-6'
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
          // No dragleave follows a drop, so always clear the overlay here.
          setDraggingFiles(false)
          if (!canUpload || !event.dataTransfer.files.length) return
          event.preventDefault()
          void upload(event.dataTransfer.files)
        }}
      >
        {variant === 'page' ? (
          <div className="-mt-4 md:hidden">{searchControl}</div>
        ) : null}
        {variant === 'embedded' ? (
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <div className="min-w-0 flex-1 overflow-hidden">
              {showBreadcrumb ? (
                <MediaBreadcrumb
                  compact
                  label={
                    data?.media.defaultLabel
                      ? _t({ message: 'Media' })
                      : (data?.media.label ?? rootPath)
                  }
                  path={directoryPath}
                  rootPath={rootPath}
                  onNavigate={navigate}
                  allowDrop={canMove}
                />
              ) : null}
              {!showBreadcrumb && directoryPath !== rootPath ? (
                <Button
                  aria-label={_t({ message: 'Parent folder' })}
                  className="sm:hidden"
                  size="icon"
                  variant="outline"
                  onClick={() =>
                    navigate(parentMediaPath(directoryPath, rootPath))
                  }
                >
                  <HugeiconsIcon aria-hidden="true" icon={ArrowUp} />
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
        {variant === 'embedded' && !centerEmptyGrid ? (
          <ScrollArea className="min-h-0 flex-1">
            <div className="pr-4 pb-1">{mediaResults}</div>
          </ScrollArea>
        ) : (
          mediaResults
        )}
        {draggingFiles ? (
          <div className="absolute inset-0 z-20 flex items-center justify-center rounded-xl border-2 border-dashed border-primary bg-background/90 text-sm font-medium">
            <UiTrans>Drop files to upload</UiTrans>
          </div>
        ) : null}
      </section>

      <MediaDragOverlay />
      {moveEntry && (
        <MediaMoveDialog
          coordinates={coordinates}
          entry={moveEntry}
          rootPath={rootPath}
          label={
            data?.media.defaultLabel
              ? _t({ message: 'Media' })
              : (data?.media.label ?? coordinates.name)
          }
          moving={pending.has(moveEntry.path)}
          onClose={() => setMoveEntry(null)}
          onCloseAutoFocus={restoreFileFocus}
          onMove={(destination) => void move(moveEntry, destination)}
        />
      )}

      <Dialog open={folderOpen} onOpenChange={setFolderOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              <UiTrans>New folder</UiTrans>
            </DialogTitle>
            <DialogDescription>
              <UiTrans>Create a folder under {directoryPath}.</UiTrans>
            </DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor={`${fieldPrefix}-folder`}>
              <UiTrans>Folder name</UiTrans>
            </FieldLabel>{' '}
            <Input
              id={`${fieldPrefix}-folder`}
              autoFocus
              placeholder={_t({ message: 'Folder name' })}
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
              aria-busy={creatingFolder}
              disabled={creatingFolder || !folderName.trim()}
              onClick={() => void createFolder()}
            >
              <UiTrans>Create folder</UiTrans>
              {creatingFolder ? (
                <Spinner aria-hidden="true" data-icon="inline-end" />
              ) : null}
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
        <DialogContent onCloseAutoFocus={restoreFileFocus}>
          <DialogHeader>
            <DialogTitle>
              <UiTrans>Rename file</UiTrans>
            </DialogTitle>
            <DialogDescription>
              <UiTrans>
                Update any content that links to the old filename.
              </UiTrans>
            </DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor={`${fieldPrefix}-filename`}>
              <UiTrans>Filename</UiTrans>
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
              aria-busy={renaming}
              disabled={renaming || !renameValue.trim()}
              onClick={() => void rename()}
            >
              <UiTrans>Rename</UiTrans>
              {renaming ? (
                <Spinner aria-hidden="true" data-icon="inline-end" />
              ) : null}
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
        <AlertDialogContent onCloseAutoFocus={restoreFileFocus}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              <UiTrans>Delete {deleteEntry?.name}?</UiTrans>
            </AlertDialogTitle>
            <AlertDialogDescription>
              <UiTrans>
                Deleting this file can break links to it in your content.
              </UiTrans>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              <UiTrans>Cancel</UiTrans>
            </AlertDialogCancel>
            <AlertDialogAction
              aria-busy={deleting}
              variant="destructive"
              disabled={deleting}
              onClick={(event) => {
                event.preventDefault()
                void remove()
              }}
            >
              <UiTrans>Delete</UiTrans>
              {deleting ? (
                <Spinner aria-hidden="true" data-icon="inline-end" />
              ) : null}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DndContext>
  )
}
