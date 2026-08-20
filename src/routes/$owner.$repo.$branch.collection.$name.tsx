import { useState } from 'react'
import {
  Link,
  createFileRoute,
  redirect,
  useRouter,
} from '@tanstack/react-router'
import { FileText, Folder, LoaderCircle, Plus, X } from 'lucide-react'

import {
  StructuredContentField,
  isContentField,
} from '#/components/structured-content-field'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { getCollection } from '#/functions/collection'
import { createStructuredCollectionEntry } from '#/functions/entry-editor'
import { getSignInUrl } from '#/lib/auth-redirect'
import { initializeStructuredContent } from '#/lib/field-values'

import type { JsonObject, JsonValue } from '#/lib/json'

interface CollectionSearch {
  path?: string
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
  const [content, setContent] = useState<JsonObject>({})
  const [filename, setFilename] = useState('')
  const [saving, setSaving] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  function openCreator() {
    setContent(initializeStructuredContent(fields))
    setFilename('')
    setCreateError(null)
    setCreating(true)
  }

  async function createEntry() {
    setSaving(true)
    setCreateError(null)
    try {
      const result = await createStructuredCollectionEntry({
        data: {
          ...params,
          parent: data.collection.path,
          content,
          ...(data.collection.filenameField ? { filename } : {}),
        },
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
        </div>
        <Button
          disabled={!data.collection.operations.create || fields.length === 0}
          title={
            fields.length === 0
              ? 'Raw entry creation is not ported yet'
              : undefined
          }
          onClick={openCreator}
        >
          <Plus /> New entry
        </Button>
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
          {fields.map((field) => {
            const name = String(field.name)
            return (
              <StructuredContentField
                field={field}
                key={name}
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
          })}
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

      {data.errors.length ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {data.errors.join(' ')}
        </div>
      ) : null}

      {data.contents.length ? (
        <ul className="overflow-hidden rounded-xl border bg-card shadow-xs">
          {data.contents.map((entry) => (
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
                      {entry.fields &&
                      typeof entry.fields === 'object' &&
                      !Array.isArray(entry.fields) &&
                      typeof entry.fields.title === 'string'
                        ? entry.fields.title
                        : entry.name}
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
          This collection is empty.
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
