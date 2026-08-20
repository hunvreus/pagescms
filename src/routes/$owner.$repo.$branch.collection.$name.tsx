import { useEffect, useMemo, useState } from 'react'
import {
  Link,
  createFileRoute,
  redirect,
  useRouter,
} from '@tanstack/react-router'
import {
  FileText,
  Folder,
  FolderPlus,
  ChevronDown,
  ChevronRight,
  LoaderCircle,
  Plus,
  Search,
  X,
} from 'lucide-react'

import {
  StructuredContentField,
  isContentField,
} from '#/components/structured-content-field'
import { RepositoryActionButtons } from '#/components/repository-action-buttons'
import { OperationError } from '#/components/operation-error'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Textarea } from '#/components/ui/textarea'
import { getCollection } from '#/functions/collection'
import {
  createCollectionFolder,
  createRawCollectionEntry,
  createStructuredCollectionEntry,
  moveEntry,
} from '#/functions/entry-editor'
import { getSignInUrl } from '#/lib/auth-redirect'
import { initializeStructuredContent } from '#/lib/field-values'

import type { JsonObject, JsonValue } from '#/lib/json'

type CollectionData = Awaited<ReturnType<typeof getCollection>>
type CollectionItem = CollectionData['contents'][number]

interface ExpandedCollection {
  open: boolean
  loading: boolean
  contents?: CollectionItem[]
  error?: string
}

interface CollectionSearch {
  path?: string
  create?: boolean
}

function jsonValueAt(value: JsonValue, path: string): JsonValue | undefined {
  let current: JsonValue | undefined = value
  for (const segment of path.split('.')) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      return
    }
    current = current[segment]
  }
  return current
}

export const Route = createFileRoute('/$owner/$repo/$branch/collection/$name')({
  validateSearch: (search: Record<string, unknown>): CollectionSearch => ({
    path:
      typeof search.path === 'string' && search.path ? search.path : undefined,
    create: search.create === true ? true : undefined,
  }),
  loaderDeps: ({ search }) => ({ path: search.path }),
  loader: async ({ params, deps }) => {
    try {
      return await getCollection({
        data: {
          owner: params.owner,
          repo: params.repo,
          branch: params.branch,
          name: params.name,
          path: deps.path,
        },
      })
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
  staleTime: 30_000,
  gcTime: 10 * 60_000,
  pendingMs: 100,
  pendingComponent: CollectionSkeleton,
  component: CollectionPage,
})

function CollectionPage() {
  const data = Route.useLoaderData()
  const params = Route.useParams()
  const search = Route.useSearch()
  const router = useRouter()
  const fields = Array.isArray(data.collection.fields)
    ? data.collection.fields.filter(isContentField)
    : []
  const [creating, setCreating] = useState(search.create === true)
  const [creationParent, setCreationParent] = useState(data.collection.path)
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [content, setContent] = useState<JsonObject | JsonValue[]>(
    data.collection.list ? [] : initializeStructuredContent(fields),
  )
  const [source, setSource] = useState('')
  const [filename, setFilename] = useState('')
  const [folder, setFolder] = useState('')
  const [saving, setSaving] = useState(false)
  const [createError, setCreateError] = useState<unknown>(null)
  const [expanded, setExpanded] = useState<
    Partial<Record<string, ExpandedCollection>>
  >({})
  const [promoting, setPromoting] = useState<string | null>(null)
  const view =
    data.collection.view &&
    typeof data.collection.view === 'object' &&
    !Array.isArray(data.collection.view)
      ? data.collection.view
      : {}
  const defaults =
    view.default &&
    typeof view.default === 'object' &&
    !Array.isArray(view.default)
      ? view.default
      : {}
  const [query, setQuery] = useState(
    typeof defaults.search === 'string' ? defaults.search : '',
  )
  const sortFields = Array.isArray(view.sort)
    ? view.sort.filter((value): value is string => typeof value === 'string')
    : []
  const [sort, setSort] = useState(
    typeof defaults.sort === 'string'
      ? defaults.sort
      : (sortFields[0] ?? 'name'),
  )
  const [order, setOrder] = useState<'asc' | 'desc'>(
    defaults.order === 'desc' ? 'desc' : 'asc',
  )
  const [page, setPage] = useState(0)
  const primaryField = typeof view.primary === 'string' ? view.primary : 'title'
  const viewFields = Array.isArray(view.fields)
    ? view.fields.filter(
        (candidate): candidate is string => typeof candidate === 'string',
      )
    : fields.flatMap((field) =>
        field.hidden !== true &&
        field.type !== 'object' &&
        field.type !== 'block' &&
        typeof field.name === 'string'
          ? [field.name]
          : [],
      )
  const secondaryFields = viewFields
    .filter((field) => field !== primaryField)
    .slice(0, 3)
  const treeLayout = view.layout === 'tree'
  const nodeView =
    view.node && typeof view.node === 'object' && !Array.isArray(view.node)
      ? view.node
      : undefined
  const nodeFilename =
    typeof nodeView?.filename === 'string' ? nodeView.filename : undefined

  useEffect(() => {
    setExpanded({})
    setCreationParent(data.collection.path)
  }, [data.collection.name, data.collection.path])

  useEffect(() => {
    setPage(0)
  }, [data.collection.path, order, query, sort])
  const visibleContents = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    const searchFields = Array.isArray(view.search)
      ? view.search.filter(
          (candidate): candidate is string => typeof candidate === 'string',
        )
      : []
    const searchable = (entry: (typeof data.contents)[number]) => {
      if (!normalizedQuery) return true
      if (entry.type === 'dir') {
        return entry.name.toLocaleLowerCase().includes(normalizedQuery)
      }
      const entryFields = entry.fields
      const values = searchFields.length
        ? searchFields.map((field) => jsonValueAt(entryFields, field))
        : [entry.name, entry.path, entryFields]
      return values.some((candidate) =>
        (typeof candidate === 'string' || typeof candidate === 'number'
          ? String(candidate)
          : JSON.stringify(candidate)
        )
          .toLocaleLowerCase()
          .includes(normalizedQuery),
      )
    }
    const sorted = data.contents.filter(searchable).sort((left, right) => {
      if (left.type !== right.type) {
        const directoriesFirst = view.foldersFirst === true
        return left.type === 'dir'
          ? directoriesFirst
            ? -1
            : 1
          : directoriesFirst
            ? 1
            : -1
      }
      const leftValue =
        left.type === 'file' && sort !== 'name'
          ? jsonValueAt(left.fields, sort)
          : left.name
      const rightValue =
        right.type === 'file' && sort !== 'name'
          ? jsonValueAt(right.fields, sort)
          : right.name
      const comparison = String(leftValue ?? '').localeCompare(
        String(rightValue ?? ''),
        undefined,
        { numeric: true, sensitivity: 'base' },
      )
      return order === 'desc' ? -comparison : comparison
    })
    return sorted
  }, [data.contents, order, query, sort, view.search])
  const pageSize = 25
  const pageCount = Math.max(1, Math.ceil(visibleContents.length / pageSize))
  const currentPage = Math.min(page, pageCount - 1)
  const displayedContents = visibleContents.slice(
    currentPage * pageSize,
    (currentPage + 1) * pageSize,
  )

  function displayFieldValue(value: JsonValue | undefined) {
    if (value === undefined || value === null || value === '') return null
    if (Array.isArray(value)) {
      return value
        .flatMap((item) =>
          typeof item === 'string' || typeof item === 'number'
            ? [String(item)]
            : [],
        )
        .join(', ')
    }
    if (typeof value === 'boolean') return value ? 'Yes' : 'No'
    if (typeof value === 'string' || typeof value === 'number') {
      return String(value)
    }
    return null
  }

  function fieldSummary(entry: Extract<CollectionItem, { type: 'file' }>) {
    const values = secondaryFields.flatMap((field) => {
      const value = displayFieldValue(jsonValueAt(entry.fields, field))
      return value ? [{ field, value }] : []
    })
    return values.length ? (
      <p className="truncate text-xs text-muted-foreground">
        {values.map(({ field, value }) => `${field}: ${value}`).join(' · ')}
      </p>
    ) : null
  }

  function openCreator(parent = data.collection.path) {
    setContent(data.collection.list ? [] : initializeStructuredContent(fields))
    setSource('')
    setFilename('')
    setCreateError(null)
    setCreationParent(parent)
    setCreating(true)
  }

  async function toggleTreeEntry(entry: CollectionItem) {
    if (entry.type !== 'dir' && !entry.isNode) return
    const key = entry.path
    const current = expanded[key]
    if (current?.open) {
      setExpanded((values) => ({
        ...values,
        [key]: { ...current, open: false },
      }))
      return
    }
    if (current?.contents) {
      setExpanded((values) => ({
        ...values,
        [key]: { ...current, open: true },
      }))
      return
    }
    setExpanded((values) => ({
      ...values,
      [key]: { open: true, loading: true },
    }))
    try {
      const result = await getCollection({
        data: {
          ...params,
          path: entry.type === 'file' ? entry.parentPath : entry.path,
        },
      })
      setExpanded((values) => ({
        ...values,
        [key]: { open: true, loading: false, contents: result.contents },
      }))
    } catch (cause) {
      setExpanded((values) => ({
        ...values,
        [key]: {
          open: true,
          loading: false,
          error:
            cause instanceof Error
              ? cause.message
              : 'Could not load child entries',
        },
      }))
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
    if (
      !window.confirm(
        `Move ${entry.path} to ${newPath} before adding child entries?`,
      )
    ) {
      return
    }
    setPromoting(entry.path)
    setCreateError(null)
    try {
      await moveEntry({
        data: { ...params, path: entry.path, newPath, sha: entry.sha },
      })
      await router.invalidate()
      openCreator(basePath)
    } catch (cause) {
      setCreateError(cause)
    } finally {
      setPromoting(null)
    }
  }

  function treeRows(entries: CollectionItem[], depth = 0): React.ReactNode {
    return entries.map((entry) => {
      const state = expanded[entry.path]
      const expandable = entry.type === 'dir' || entry.isNode
      const promotable =
        entry.type === 'file' &&
        !entry.isNode &&
        Boolean(nodeFilename) &&
        data.collection.operations.create &&
        data.collection.operations.rename
      const title =
        entry.type === 'file'
          ? (() => {
              const primary = jsonValueAt(entry.fields, primaryField)
              return typeof primary === 'string' || typeof primary === 'number'
                ? String(primary)
                : entry.name
            })()
          : entry.name
      const childParent = entry.type === 'file' ? entry.parentPath : entry.path
      return (
        <li className="border-b last:border-b-0" key={entry.path}>
          <div
            className="flex items-center gap-2 px-3 py-2.5 hover:bg-muted/60"
            style={{ paddingLeft: `${12 + depth * 24}px` }}
          >
            {expandable ? (
              <Button
                aria-label={`${state?.open ? 'Collapse' : 'Expand'} ${title}`}
                size="icon"
                type="button"
                variant="ghost"
                onClick={() => void toggleTreeEntry(entry)}
              >
                {state?.loading ? (
                  <LoaderCircle className="animate-spin" />
                ) : state?.open ? (
                  <ChevronDown />
                ) : (
                  <ChevronRight />
                )}
              </Button>
            ) : (
              <span className="size-9" />
            )}
            {entry.type === 'dir' ? (
              <Folder className="size-4 text-muted-foreground" />
            ) : (
              <FileText className="size-4 text-muted-foreground" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{title}</p>
              <p className="truncate text-xs text-muted-foreground">
                {entry.path}
              </p>
              {entry.type === 'file' ? fieldSummary(entry) : null}
            </div>
            {data.collection.operations.create && (expandable || promotable) ? (
              <Button
                aria-label={`Add child to ${title}`}
                disabled={promoting === entry.path}
                size="icon"
                type="button"
                variant="outline"
                onClick={() =>
                  entry.type === 'file' && promotable
                    ? void promoteToNode(entry)
                    : openCreator(childParent)
                }
              >
                {promoting === entry.path ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <Plus />
                )}
              </Button>
            ) : null}
            {entry.type === 'file' ? (
              <Button asChild size="sm" variant="outline">
                <Link
                  params={{ ...params, _splat: entry.path }}
                  to="/$owner/$repo/$branch/collection/$name/entry/$"
                >
                  Edit
                </Link>
              </Button>
            ) : null}
          </div>
          {state?.open ? (
            state.error ? (
              <p
                className="border-t px-4 py-2 text-xs text-destructive"
                style={{ paddingLeft: `${52 + depth * 24}px` }}
              >
                {state.error}
              </p>
            ) : state.contents?.length ? (
              <ul>{treeRows(state.contents, depth + 1)}</ul>
            ) : !state.loading ? (
              <p
                className="border-t px-4 py-2 text-xs text-muted-foreground"
                style={{ paddingLeft: `${52 + depth * 24}px` }}
              >
                No child entries.
              </p>
            ) : null
          ) : null}
        </li>
      )
    })
  }

  async function createEntry() {
    setSaving(true)
    setCreateError(null)
    try {
      const coordinates = {
        ...params,
        parent: creationParent,
        ...(data.collection.filenameField ? { filename } : {}),
      }
      const result = fields.length
        ? await createStructuredCollectionEntry({
            data: { ...coordinates, content },
          })
        : await createRawCollectionEntry({
            data: { ...coordinates, source },
          })
      setCreating(false)
      await router.navigate({
        href: `/${encodeURIComponent(params.owner)}/${encodeURIComponent(params.repo)}/${encodeURIComponent(params.branch)}/collection/${encodeURIComponent(params.name)}/entry/${result.path.split('/').map(encodeURIComponent).join('/')}`,
      })
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
      await router.invalidate()
    } catch (cause) {
      setCreateError(cause)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">
            {data.collection.path}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {data.collection.label}
          </h1>
          {data.stale ? (
            <p className="text-xs text-muted-foreground">
              Refreshing cached content…
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
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
            <Button
              disabled={!data.collection.operations.create}
              variant="outline"
              onClick={() => {
                setCreating(false)
                setFolder('')
                setCreateError(null)
                setCreatingFolder(true)
              }}
            >
              <FolderPlus /> New folder
            </Button>
          ) : null}
          <Button
            disabled={!data.collection.operations.create}
            onClick={() => openCreator()}
          >
            <Plus /> New entry
          </Button>
        </div>
      </header>

      {creating ? (
        <form
          className="space-y-5 rounded-xl border bg-card p-5 shadow-xs"
          onSubmit={(event) => {
            event.preventDefault()
            void createEntry()
          }}
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-semibold">New entry</h2>
              <p className="text-xs text-muted-foreground">{creationParent}</p>
            </div>
            <Button
              aria-label="Cancel entry creation"
              size="icon"
              type="button"
              variant="ghost"
              onClick={() => setCreating(false)}
            >
              <X />
            </Button>
          </div>
          {data.collection.filenameField ? (
            <label className="block space-y-2">
              <span className="text-sm font-medium">Filename *</span>
              <Input
                required
                value={filename}
                onChange={(event) => setFilename(event.target.value)}
              />
            </label>
          ) : null}
          {fields.length ? (
            data.collection.list ? (
              <StructuredContentField
                field={{
                  name: 'items',
                  label: false,
                  type: 'object',
                  fields,
                  list: data.collection.list,
                }}
                referenceContext={{ ...params, media: data.media }}
                value={content}
                onChange={(value) => {
                  setContent(Array.isArray(value) ? value : [])
                }}
              />
            ) : (
              fields.map((field) => {
                const name = String(field.name)
                return (
                  <StructuredContentField
                    field={field}
                    key={name}
                    referenceContext={{ ...params, media: data.media }}
                    value={Array.isArray(content) ? undefined : content[name]}
                    onChange={(value: JsonValue | undefined) => {
                      setContent((current) => {
                        const next = Array.isArray(current)
                          ? {}
                          : { ...current }
                        if (value === undefined) delete next[name]
                        else next[name] = value
                        return next
                      })
                    }}
                  />
                )
              })
            )
          ) : (
            <label className="block space-y-2">
              <span className="text-sm font-medium">Content</span>
              <Textarea
                className="min-h-72 font-mono"
                value={source}
                onChange={(event) => setSource(event.target.value)}
              />
            </label>
          )}
          <OperationError
            error={createError}
            fallback="Could not create entry."
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreating(false)}
            >
              Cancel
            </Button>
            <Button disabled={saving} type="submit">
              {saving ? <LoaderCircle className="animate-spin" /> : <Plus />}
              {saving ? 'Creating' : 'Create entry'}
            </Button>
          </div>
        </form>
      ) : null}

      {creatingFolder ? (
        <form
          className="space-y-4 rounded-xl border bg-card p-5 shadow-xs"
          onSubmit={(event) => {
            event.preventDefault()
            void createFolder()
          }}
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-semibold">New folder</h2>
              <p className="text-xs text-muted-foreground">
                Under {data.collection.path}
              </p>
            </div>
            <Button
              aria-label="Cancel folder creation"
              size="icon"
              type="button"
              variant="ghost"
              onClick={() => setCreatingFolder(false)}
            >
              <X />
            </Button>
          </div>
          <label className="block space-y-2">
            <span className="text-sm font-medium">Folder path *</span>
            <Input
              required
              placeholder="drafts or 2026/launches"
              value={folder}
              onChange={(event) => setFolder(event.target.value)}
            />
          </label>
          <OperationError
            error={createError}
            fallback="Could not create folder."
          />
          <div className="flex justify-end gap-2">
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
          </div>
        </form>
      ) : null}

      {data.errors.length ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {data.errors.join(' ')}
        </div>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search collection"
            className="pl-9"
            placeholder="Search entries…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <select
          aria-label="Sort collection"
          className="h-10 rounded-lg border bg-background px-3 text-sm"
          value={sort}
          onChange={(event) => setSort(event.target.value)}
        >
          <option value="name">Filename</option>
          {sortFields
            .filter((field) => field !== 'name')
            .map((field) => (
              <option key={field} value={field}>
                {field}
              </option>
            ))}
        </select>
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            setOrder((current) => (current === 'asc' ? 'desc' : 'asc'))
          }
        >
          {order === 'asc' ? 'Ascending' : 'Descending'}
        </Button>
      </div>

      {!treeLayout && data.collection.path !== data.collection.rootPath ? (
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

      {displayedContents.length ? (
        <ul className="overflow-hidden rounded-xl border bg-card shadow-xs">
          {treeLayout
            ? treeRows(displayedContents)
            : displayedContents.map((entry) => (
                <li className="border-b last:border-b-0" key={entry.path}>
                  {entry.type === 'dir' ? (
                    <Link
                      className="flex items-center gap-3 px-4 py-3 hover:bg-muted/60"
                      params={params}
                      search={{ path: entry.path }}
                      to="/$owner/$repo/$branch/collection/$name"
                    >
                      <Folder className="size-4 text-muted-foreground" />
                      <span className="font-medium">{entry.name}</span>
                    </Link>
                  ) : (
                    <div className="flex items-center gap-3 px-4 py-3">
                      <FileText className="size-4 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">
                          {(() => {
                            const primary = jsonValueAt(
                              entry.fields,
                              primaryField,
                            )
                            return typeof primary === 'string' ||
                              typeof primary === 'number'
                              ? String(primary)
                              : entry.name
                          })()}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {entry.path}
                        </p>
                        {fieldSummary(entry)}
                      </div>
                      <Button asChild size="sm" variant="outline">
                        <Link
                          params={{ ...params, _splat: entry.path }}
                          to="/$owner/$repo/$branch/collection/$name/entry/$"
                        >
                          Edit
                        </Link>
                      </Button>
                    </div>
                  )}
                </li>
              ))}
        </ul>
      ) : (
        <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground shadow-xs">
          {query
            ? 'No entries match this search.'
            : 'This collection is empty.'}
        </div>
      )}
      {visibleContents.length > pageSize ? (
        <nav
          aria-label="Collection pages"
          className="flex items-center justify-between gap-3"
        >
          <p className="text-sm text-muted-foreground">
            Page {currentPage + 1} of {pageCount}
          </p>
          <div className="flex gap-2">
            <Button
              disabled={currentPage === 0}
              type="button"
              variant="outline"
              onClick={() => setPage((value) => Math.max(0, value - 1))}
            >
              Previous
            </Button>
            <Button
              disabled={currentPage >= pageCount - 1}
              type="button"
              variant="outline"
              onClick={() =>
                setPage((value) => Math.min(pageCount - 1, value + 1))
              }
            >
              Next
            </Button>
          </div>
        </nav>
      ) : null}
    </div>
  )
}

function CollectionSkeleton() {
  return (
    <div
      className="mx-auto max-w-5xl animate-pulse space-y-5"
      aria-label="Loading collection"
    >
      <div className="h-8 w-48 rounded bg-muted" />
      <div className="h-64 rounded-xl border bg-card" />
    </div>
  )
}
