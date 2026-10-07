import { Fragment, useEffect, useMemo, useState } from 'react'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import {
  Link,
  createFileRoute,
  redirect,
  useRouter,
} from '@tanstack/react-router'
import { FolderPlus, LoaderCircle, Plus, Search } from 'lucide-react'

import { isContentField } from '#/lib/content-field'
import { RepositoryActionButtons } from '#/components/repository-action-buttons'
import { RepositoryPageHeader } from '#/components/repository-page-header'
import { OperationError } from '#/components/operation-error'
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
  BreadcrumbEllipsis,
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
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { Field, FieldLabel } from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '#/components/ui/tooltip'
import { CollectionTable } from '#/features/collections/collection-table'
import { collectionViewModel } from '#/features/collections/collection-model'
import { CollectionSkeleton } from '#/features/collections/collection-skeleton'
import type { getCollection } from '#/functions/collection'
import {
  createCollectionFolder,
  deleteEntry,
  moveEntry,
  renameEntry,
} from '#/functions/entry-editor'
import { getSignInUrl } from '#/lib/auth-redirect'
import { getGitRelativePath, joinGitPath } from '#/lib/git-path'
import { collectionQueryOptions } from '#/queries/content'
import { queryKeys } from '#/queries/keys'

type CollectionData = Awaited<ReturnType<typeof getCollection>>
type CollectionItem = CollectionData['contents'][number]

interface ExpandedCollection {
  loading: boolean
  contents?: CollectionItem[]
}

interface CollectionSearch {
  path?: string
}

export const Route = createFileRoute('/$owner/$repo/$branch/collection/$name')({
  validateSearch: (search: Record<string, unknown>): CollectionSearch => ({
    path:
      typeof search.path === 'string' && search.path ? search.path : undefined,
  }),
  loaderDeps: ({ search }) => ({ path: search.path }),
  loader: async ({ context, params, deps }) => {
    try {
      await context.queryClient.ensureQueryData(
        collectionQueryOptions({
          owner: params.owner,
          repo: params.repo,
          branch: params.branch,
          name: params.name,
          path: deps.path,
        }),
      )
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'Authentication required'
      ) {
        throw redirect({
          href: getSignInUrl(
            `/${params.owner}/${params.repo}/${encodeURIComponent(params.branch)}/collection/${encodeURIComponent(params.name)}`,
          ),
        })
      }
      throw error
    }
  },
  pendingMs: 100,
  pendingComponent: CollectionSkeleton,
  component: CollectionPage,
})

function CollectionPage() {
  const params = Route.useParams()
  const search = Route.useSearch()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { data, isFetching } = useSuspenseQuery(
    collectionQueryOptions({ ...params, path: search.path }),
  )
  const fields = useMemo(
    () =>
      Array.isArray(data.collection.fields)
        ? data.collection.fields.filter(isContentField)
        : [],
    [data.collection.fields],
  )
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [folder, setFolder] = useState('')
  const [saving, setSaving] = useState(false)
  const [createError, setCreateError] = useState<unknown>(null)
  const [expanded, setExpanded] = useState<
    Partial<Record<string, ExpandedCollection>>
  >({})
  const [renaming, setRenaming] = useState<
    Extract<CollectionItem, { type: 'file' }> | undefined
  >()
  const [deleting, setDeleting] = useState<
    Extract<CollectionItem, { type: 'file' }> | undefined
  >()
  const [promoting, setPromoting] = useState<
    Extract<CollectionItem, { type: 'file' }> | undefined
  >()
  const [renamedFilename, setRenamedFilename] = useState('')
  const view =
    data.collection.view &&
    typeof data.collection.view === 'object' &&
    !Array.isArray(data.collection.view)
      ? data.collection.view
      : {}
  const tableModel = useMemo(
    () =>
      collectionViewModel({ fields, filename: data.collection.filename, view }),
    [data.collection.filename, fields, view],
  )
  const [tableSearch, setTableSearch] = useState(tableModel.initial.search)
  const nodeView =
    view.node && typeof view.node === 'object' && !Array.isArray(view.node)
      ? view.node
      : undefined
  const nodeFilename =
    typeof nodeView?.filename === 'string' ? nodeView.filename : undefined

  useEffect(() => {
    setExpanded({})
    setTableSearch(tableModel.initial.search)
  }, [
    data.collection.name,
    data.collection.path,
    params.branch,
    params.owner,
    params.repo,
    tableModel.initial.search,
  ])

  function openCreator(parent = data.collection.path) {
    void router.navigate({ to: creatorHref(parent) })
  }

  function creatorHref(parent = data.collection.path) {
    const pathname = `/${encodeURIComponent(params.owner)}/${encodeURIComponent(params.repo)}/${encodeURIComponent(params.branch)}/collection/${encodeURIComponent(params.name)}/new`
    return parent === data.collection.rootPath
      ? pathname
      : `${pathname}?${new URLSearchParams({ parent })}`
  }

  async function toggleTreeEntry(entry: CollectionItem) {
    if (entry.type !== 'dir' && !entry.isNode) return
    const key = entry.path
    const current = expanded[key]
    if (current?.contents) return
    setExpanded((values) => ({
      ...values,
      [key]: { loading: true },
    }))
    try {
      const result = await queryClient.ensureQueryData(
        collectionQueryOptions({
          ...params,
          path: entry.type === 'file' ? entry.parentPath : entry.path,
        }),
      )
      setExpanded((values) => ({
        ...values,
        [key]: { loading: false, contents: result.contents },
      }))
    } catch (cause) {
      setExpanded((values) => ({
        ...values,
        [key]: { loading: false },
      }))
      setCreateError(cause)
      throw cause
    }
  }

  async function promoteToNode(
    entry: Extract<CollectionItem, { type: 'file' }>,
  ) {
    if (!nodeFilename || !entry.sha) return
    const extension = data.collection.extension
      ? `.${data.collection.extension}`
      : ''
    const basePath =
      extension && entry.path.endsWith(extension)
        ? entry.path.slice(0, -extension.length)
        : entry.path
    const newPath = `${basePath}/${nodeFilename}`
    setSaving(true)
    setCreateError(null)
    try {
      await moveEntry({
        data: { ...params, path: entry.path, newPath, sha: entry.sha },
      })
      await queryClient.invalidateQueries({
        queryKey: queryKeys.branch(params),
      })
      setPromoting(undefined)
      openCreator(basePath)
    } catch (cause) {
      setCreateError(cause)
    } finally {
      setSaving(false)
    }
  }

  async function createFolder() {
    setSaving(true)
    setCreateError(null)
    try {
      await createCollectionFolder({
        data: {
          ...params,
          parent: data.collection.path,
          folder,
        },
      })
      setCreatingFolder(false)
      setFolder('')
      await queryClient.invalidateQueries({
        queryKey: queryKeys.branch(params),
      })
    } catch (cause) {
      setCreateError(cause)
    } finally {
      setSaving(false)
    }
  }

  async function refreshCollection() {
    await queryClient.invalidateQueries({ queryKey: queryKeys.branch(params) })
    setExpanded({})
  }

  async function commitRename() {
    if (!renaming?.sha || !renamedFilename.trim()) return
    setSaving(true)
    setCreateError(null)
    try {
      await renameEntry({
        data: {
          ...params,
          path: renaming.path,
          sha: renaming.sha,
          filename: renamedFilename,
        },
      })
      setRenaming(undefined)
      await refreshCollection()
    } catch (cause) {
      setCreateError(cause)
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!deleting?.sha) return
    setSaving(true)
    setCreateError(null)
    try {
      await deleteEntry({
        data: {
          ...params,
          path: deleting.path,
          sha: deleting.sha,
        },
      })
      setDeleting(undefined)
      await refreshCollection()
    } catch (cause) {
      setCreateError(cause)
    } finally {
      setSaving(false)
    }
  }

  const childRows = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(expanded).flatMap(([path, state]) =>
          state?.contents ? [[path, state.contents]] : [],
        ),
      ),
    [expanded],
  )
  const loadingRows = useMemo(
    () =>
      new Set(
        Object.entries(expanded).flatMap(([path, state]) =>
          state?.loading ? [path] : [],
        ),
      ),
    [expanded],
  )

  function addChild(entry: CollectionItem) {
    if (
      entry.type === 'file' &&
      !entry.isNode &&
      nodeFilename &&
      data.collection.operations.rename
    ) {
      setPromoting(entry)
      return
    }
    openCreator(entry.type === 'file' ? entry.parentPath : entry.path)
  }

  return (
    <div className="-mt-4 space-y-5 md:-mt-6">
      <CollectionHeader
        actions={
          <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
            <label className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="Search collection"
                className="pl-9"
                placeholder="Search entries…"
                value={tableSearch}
                onChange={(event) => setTableSearch(event.target.value)}
              />
            </label>
            <RepositoryActionButtons
              actions={data.collection.actions}
              context={{
                type: 'collection',
                name: data.collection.name,
                path: data.collection.path,
                data: {
                  label: data.collection.label,
                  rootPath: data.collection.rootPath,
                  format: data.collection.format,
                },
              }}
              coordinates={params}
            />
            {data.collection.subfolders ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      aria-label="New folder"
                      disabled={!data.collection.operations.create}
                      size="icon"
                      variant="outline"
                      onClick={() => {
                        setFolder('')
                        setCreateError(null)
                        setCreatingFolder(true)
                      }}
                    >
                      <FolderPlus />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>New folder</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : null}
            {data.collection.operations.create ? (
              <Button asChild>
                <Link to={creatorHref()}>
                  <Plus /> New entry
                </Link>
              </Button>
            ) : (
              <Button disabled>
                <Plus /> New entry
              </Button>
            )}
          </div>
        }
        refreshing={isFetching}
        title={
          <CollectionBreadcrumb collection={data.collection} params={params} />
        }
      />

      <Dialog
        open={creatingFolder}
        onOpenChange={(open) => {
          setCreatingFolder(open)
          if (!open) {
            setFolder('')
            setCreateError(null)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create a folder</DialogTitle>
            <DialogDescription>
              Choose a path under {data.collection.path}.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault()
              void createFolder()
            }}
          >
            <Field>
              <FieldLabel htmlFor="new-folder-path">Folder path</FieldLabel>
              <Input
                autoFocus
                id="new-folder-path"
                required
                placeholder="drafts or 2026/launches"
                value={folder}
                onChange={(event) => setFolder(event.target.value)}
              />
            </Field>
            <OperationError
              error={createError}
              fallback="Could not create folder."
            />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreatingFolder(false)}
              >
                Cancel
              </Button>
              <Button disabled={saving || !folder.trim()} type="submit">
                {saving ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <FolderPlus />
                )}
                {saving ? 'Creating' : 'Create folder'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {data.errors.length ? (
        <OperationError
          error={true}
          fallback="Some entries could not be loaded."
        />
      ) : null}

      {tableModel.layout !== 'tree' &&
      data.collection.path !== data.collection.rootPath ? (
        <Link
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          params={params}
          search={{
            path: (() => {
              const parts = data.collection.path.split('/')
              parts.pop()
              const parent = parts.join('/')
              return parent === data.collection.rootPath ? undefined : parent
            })(),
          }}
          to="/$owner/$repo/$branch/collection/$name"
        >
          <span aria-hidden>←</span> Parent folder
        </Link>
      ) : null}

      <CollectionTable
        key={`${params.owner}:${params.repo}:${params.branch}:${data.collection.name}:${data.collection.path}`}
        canAddChild={(entry) =>
          tableModel.layout === 'tree' &&
          (entry.type === 'dir' ||
            entry.isNode ||
            Boolean(nodeFilename && data.collection.operations.rename))
        }
        canCreate={data.collection.operations.create}
        canDelete={data.collection.operations.delete}
        canRename={data.collection.operations.rename}
        children={childRows}
        data={data.contents}
        loading={loadingRows}
        media={data.media}
        model={tableModel}
        repository={params}
        search={tableSearch}
        onSearchChange={setTableSearch}
        onAddChild={addChild}
        onDelete={setDeleting}
        onExpand={toggleTreeEntry}
        onRename={(entry) => {
          setRenaming(entry)
          setRenamedFilename(entry.name)
        }}
      />

      <Dialog
        open={Boolean(renaming)}
        onOpenChange={(open) => {
          if (!open) setRenaming(undefined)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename entry</DialogTitle>
            <DialogDescription>
              Change the filename for {renaming?.name}.
            </DialogDescription>
          </DialogHeader>
          <form
            className="contents"
            onSubmit={(event) => {
              event.preventDefault()
              void commitRename()
            }}
          >
            <Field>
              <FieldLabel htmlFor="collection-entry-filename">
                Filename
              </FieldLabel>
              <Input
                id="collection-entry-filename"
                required
                value={renamedFilename}
                onChange={(event) => setRenamedFilename(event.target.value)}
              />
            </Field>
            <DialogFooter showCloseButton>
              <Button
                disabled={saving || !renamedFilename.trim()}
                type="submit"
              >
                {saving ? <LoaderCircle className="animate-spin" /> : null}
                Rename
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(promoting)}
        onOpenChange={(open) => {
          if (!open) setPromoting(undefined)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Move this entry first?</AlertDialogTitle>
            <AlertDialogDescription>
              {promoting && nodeFilename
                ? `${promoting.path} must become a node entry before it can contain children.`
                : 'This entry must become a node before it can contain children.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={saving}
              onClick={() => {
                if (promoting) void promoteToNode(promoting)
              }}
            >
              {saving ? <LoaderCircle className="animate-spin" /> : null}
              Move and continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open) setDeleting(undefined)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete entry?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete {deleting?.name} from the repository. This action
              cannot be undone from Pages CMS.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={saving}
              variant="destructive"
              onClick={() => void confirmDelete()}
            >
              {saving ? <LoaderCircle className="animate-spin" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function CollectionHeader({
  actions,
  refreshing = false,
  title,
}: {
  actions: React.ReactNode
  refreshing?: boolean
  title: React.ReactNode
}) {
  return (
    <RepositoryPageHeader
      actions={actions}
      className="-mx-4 md:-mx-6"
      refreshing={refreshing}
    >
      {title}
    </RepositoryPageHeader>
  )
}

function CollectionBreadcrumb({
  collection,
  params,
}: {
  collection: CollectionData['collection']
  params: { owner: string; repo: string; branch: string; name: string }
}) {
  const relative = getGitRelativePath(collection.path, collection.rootPath)
  const segments = relative.split('/').filter(Boolean)
  const entries = segments.map((name, index) => ({
    name,
    path: joinGitPath(collection.rootPath, ...segments.slice(0, index + 1)),
  }))
  const middle = entries.length > 3 ? entries.slice(1, -1) : []
  const visible =
    entries.length > 3 ? [entries[0], entries[entries.length - 1]] : entries

  return (
    <Breadcrumb>
      <BreadcrumbList className="flex-nowrap text-lg font-medium">
        {collection.groupTrail.map((group) => (
          <Fragment key={group.name}>
            <BreadcrumbItem>
              <span>{group.label}</span>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
          </Fragment>
        ))}
        <BreadcrumbItem className={entries.length ? undefined : 'min-w-0'}>
          {entries.length ? (
            <BreadcrumbLink asChild>
              <Link
                to="/$owner/$repo/$branch/collection/$name"
                params={params}
                search={{ path: undefined }}
              >
                {collection.label}
              </Link>
            </BreadcrumbLink>
          ) : (
            <BreadcrumbPage className="block truncate font-medium">
              {collection.label}
            </BreadcrumbPage>
          )}
        </BreadcrumbItem>
        {entries.length ? <BreadcrumbSeparator /> : null}
        {entries.length > 3 ? (
          <>
            <BreadcrumbItem>
              <DropdownMenu>
                <DropdownMenuTrigger className="flex items-center">
                  <BreadcrumbEllipsis className="size-6" />
                  <span className="sr-only">Show hidden folders</span>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {middle.map((entry) => (
                    <DropdownMenuItem key={entry.path} asChild>
                      <Link
                        to="/$owner/$repo/$branch/collection/$name"
                        params={params}
                        search={{ path: entry.path }}
                      >
                        {entry.name}
                      </Link>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
          </>
        ) : null}
        {visible.map((entry, index) => {
          const last = index === visible.length - 1
          return (
            <Fragment key={entry.path}>
              <BreadcrumbItem className={last ? 'min-w-0' : undefined}>
                {last ? (
                  <BreadcrumbPage className="block truncate font-medium">
                    {entry.name}
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link
                      to="/$owner/$repo/$branch/collection/$name"
                      params={params}
                      search={{ path: entry.path }}
                    >
                      {entry.name}
                    </Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {!last ? <BreadcrumbSeparator /> : null}
            </Fragment>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
