import { useState } from 'react'
import {
  Link,
  createFileRoute,
  redirect,
  useRouter,
} from '@tanstack/react-router'
import { File, Folder, LoaderCircle, Trash2, Upload } from 'lucide-react'

import { Button } from '#/components/ui/button'
import { RepositoryActionButtons } from '#/components/repository-action-buttons'
import { createMedia, getMedia, removeMedia } from '#/functions/media'
import { getSignInUrl } from '#/lib/auth-redirect'

interface MediaSearch {
  path?: string
}

export const Route = createFileRoute('/$owner/$repo/$branch/media/$name')({
  validateSearch: (search: Record<string, unknown>): MediaSearch => ({
    path:
      typeof search.path === 'string' && search.path ? search.path : undefined,
  }),
  loaderDeps: ({ search }) => ({ path: search.path }),
  loader: async ({ params, deps }) => {
    try {
      return await getMedia({ data: { ...params, path: deps.path } })
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'Authentication required'
      ) {
        throw redirect({
          href: getSignInUrl(
            `/${params.owner}/${params.repo}/${encodeURIComponent(params.branch)}/media/${encodeURIComponent(params.name)}`,
          ),
        })
      }
      throw error
    }
  },
  staleTime: 30_000,
  gcTime: 10 * 60_000,
  pendingMs: 100,
  pendingComponent: MediaSkeleton,
  component: MediaPage,
})

function fileBase64(file: globalThis.File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`))
    reader.onload = () => {
      const result = String(reader.result)
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.readAsDataURL(file)
  })
}

function formatSize(value: number | null) {
  if (value === null) return ''
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

function MediaPage() {
  const data = Route.useLoaderData()
  const params = Route.useParams()
  const router = useRouter()
  const [uploading, setUploading] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function upload(files: FileList | null) {
    if (!files?.length) return
    setUploading(true)
    setError(null)
    try {
      for (const file of files) {
        if (file.size > 20 * 1024 * 1024) {
          throw new Error(`${file.name} exceeds the 20 MB limit`)
        }
        await createMedia({
          data: {
            ...params,
            path: data.media.path,
            filename: file.name,
            content: await fileBase64(file),
          },
        })
      }
      await router.invalidate()
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not upload media',
      )
    } finally {
      setUploading(false)
    }
  }

  async function remove(path: string, sha: string | null) {
    if (!sha || !window.confirm(`Delete ${path}? This creates a commit.`))
      return
    setDeleting(path)
    setError(null)
    try {
      await removeMedia({ data: { ...params, path, sha } })
      await router.invalidate()
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not delete media',
      )
    } finally {
      setDeleting(null)
    }
  }

  const accept = data.media.extensions.length
    ? data.media.extensions.map((value) => `.${value}`).join(',')
    : undefined

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">{data.media.path}</p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {data.media.label}
          </h1>
          {data.stale ? (
            <p className="text-xs text-muted-foreground">
              Refreshing cached media…
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
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
            coordinates={params}
          />
          <Button asChild disabled={uploading}>
            <label>
              {uploading ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <Upload />
              )}
              {uploading ? 'Uploading' : 'Upload'}
              <input
                multiple
                accept={accept}
                className="sr-only"
                disabled={uploading}
                type="file"
                onChange={(event) => {
                  void upload(event.target.files)
                  event.target.value = ''
                }}
              />
            </label>
          </Button>
        </div>
      </header>
      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}
      {data.entries.length ? (
        <ul className="overflow-hidden rounded-xl border bg-card shadow-xs">
          {data.entries.map((entry) => (
            <li className="border-b last:border-b-0" key={entry.path}>
              {entry.type === 'dir' ? (
                <Link
                  className="flex items-center gap-3 px-4 py-3 hover:bg-muted/60"
                  params={params}
                  search={{ path: entry.path }}
                  to="/$owner/$repo/$branch/media/$name"
                >
                  <Folder className="size-4 text-muted-foreground" />
                  <span className="font-medium">{entry.name}</span>
                </Link>
              ) : (
                <div className="flex items-center gap-3 px-4 py-3">
                  <File className="size-4 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{entry.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatSize(entry.size)}
                    </p>
                  </div>
                  <Button
                    aria-label={`Delete ${entry.name}`}
                    disabled={deleting === entry.path}
                    size="icon"
                    variant="destructive"
                    onClick={() => void remove(entry.path, entry.sha)}
                  >
                    {deleting === entry.path ? (
                      <LoaderCircle className="animate-spin" />
                    ) : (
                      <Trash2 />
                    )}
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground shadow-xs">
          This media directory is empty.
        </div>
      )}
    </div>
  )
}

function MediaSkeleton() {
  return (
    <div
      className="mx-auto max-w-5xl animate-pulse space-y-5"
      aria-label="Loading media"
    >
      <div className="h-8 w-48 rounded bg-muted" />
      <div className="h-64 rounded-xl border bg-card" />
    </div>
  )
}
