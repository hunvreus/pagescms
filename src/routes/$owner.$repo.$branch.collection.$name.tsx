import { useMemo, useState } from 'react'
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
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Textarea } from '#/components/ui/textarea'
import { getCollection } from '#/functions/collection'
import {
  createCollectionFolder,
  createRawCollectionEntry,
  createStructuredCollectionEntry,
} from '#/functions/entry-editor'
import { getSignInUrl } from '#/lib/auth-redirect'
import { initializeStructuredContent } from '#/lib/field-values'

import type { JsonObject, JsonValue } from '#/lib/json'

interface CollectionSearch {
  path?: string
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
  const router = useRouter()
  const fields = Array.isArray(data.collection.fields)
    ? data.collection.fields.filter(isContentField)
    : []
  const [creating, setCreating] = useState(false)
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [content, setContent] = useState<JsonObject>({})
  const [source, setSource] = useState('')
  const [filename, setFilename] = useState('')
  const [folder, setFolder] = useState('')
  const [saving, setSaving] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
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
  const primaryField = typeof view.primary === 'string' ? view.primary : 'title'
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
      if (left.type !== right.type) return left.type === 'dir' ? -1 : 1
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

  function openCreator() {
    setContent(initializeStructuredContent(fields))
    setSource('')
    setFilename('')
    setCreateError(null)
    setCreating(true)
  }

  async function createEntry() {
    setSaving(true)
    setCreateError(null)
    try {
      const coordinates = {
        ...params,
        parent: data.collection.path,
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
      setCreateError(
        cause instanceof Error ? cause.message : 'Could not create entry',
      )
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
      setCreateError(
        cause instanceof Error ? cause.message : 'Could not create folder',
      )
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
            onClick={openCreator}
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
              <p className="text-xs text-muted-foreground">
                {data.collection.path}
              </p>
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
            fields.map((field) => {
              const name = String(field.name)
              return (
                <StructuredContentField
                  field={field}
                  key={name}
                  referenceContext={{ ...params, media: data.media }}
                  value={content[name]}
                  onChange={(value: JsonValue | undefined) => {
                    setContent((current) => {
                      const next = { ...current }
                      if (value === undefined) delete next[name]
                      else next[name] = value
                      return next
                    })
                  }}
                />
              )
            })
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
          {createError ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {createError}
            </div>
          ) : null}
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
          {createError ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {createError}
            </div>
          ) : null}
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

      {data.collection.path !== data.collection.rootPath ? (
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

      {visibleContents.length ? (
        <ul className="overflow-hidden rounded-xl border bg-card shadow-xs">
          {visibleContents.map((entry) => (
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
                        const primary = jsonValueAt(entry.fields, primaryField)
                        return typeof primary === 'string' ||
                          typeof primary === 'number'
                          ? String(primary)
                          : entry.name
                      })()}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {entry.path}
                    </p>
                  </div>
                  <Button asChild size="sm" variant="outline">
                    <a
                      href={`/${encodeURIComponent(params.owner)}/${encodeURIComponent(params.repo)}/${encodeURIComponent(params.branch)}/collection/${encodeURIComponent(params.name)}/entry/${entry.path.split('/').map(encodeURIComponent).join('/')}`}
                    >
                      Edit
                    </a>
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
