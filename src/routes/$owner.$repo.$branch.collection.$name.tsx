import { Link, createFileRoute, redirect } from '@tanstack/react-router'
import { FileText, Folder, Plus } from 'lucide-react'

import { Button } from '#/components/ui/button'
import { getCollection } from '#/functions/collection'
import { getSignInUrl } from '#/lib/auth-redirect'

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
        <Button disabled>
          <Plus /> New entry
        </Button>
      </header>

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
                  <Button disabled size="sm" variant="outline">
                    Edit
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
