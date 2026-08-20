import { useEffect, useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import {
  Check,
  ExternalLink,
  History,
  LoaderCircle,
  Pencil,
  Save,
  Trash2,
  X,
} from 'lucide-react'

import {
  StructuredContentField,
  isContentField,
} from '#/components/structured-content-field'
import { RepositoryActionButtons } from '#/components/repository-action-buttons'
import { Button } from '#/components/ui/button'
import { Textarea } from '#/components/ui/textarea'
import {
  deleteEntry,
  getEntryHistory,
  renameEntry,
  updateRawEntry,
  updateStructuredEntry,
} from '#/functions/entry-editor'
import type { getRawEntry } from '#/functions/entry-editor'

type LoadedEntryData = Awaited<ReturnType<typeof getRawEntry>>
type EntryData = LoadedEntryData extends infer Entry
  ? Entry extends { sha: string }
    ? Omit<Entry, 'sha'> & { sha: string | null }
    : never
  : never

export interface ContentEntryCoordinates {
  owner: string
  repo: string
  branch: string
  name: string
  path: string
}

export function ContentEntryEditor({
  initial,
  coordinates,
  afterDeleteHref,
  renameBaseHref,
}: {
  initial: EntryData
  coordinates: ContentEntryCoordinates
  afterDeleteHref: string
  renameBaseHref?: string
}) {
  return initial.mode === 'structured' ? (
    <StructuredEntryEditor
      afterDeleteHref={afterDeleteHref}
      coordinates={coordinates}
      initial={initial}
      renameBaseHref={renameBaseHref}
    />
  ) : (
    <RawEntryEditor
      afterDeleteHref={afterDeleteHref}
      coordinates={coordinates}
      initial={initial}
      renameBaseHref={renameBaseHref}
    />
  )
}

function useUnsavedWarning(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
}

function useEntryDeletion(
  coordinates: ContentEntryCoordinates,
  sha: string | null,
  afterDeleteHref: string,
) {
  const router = useRouter()
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return {
    deleting,
    error,
    async remove() {
      if (!sha) return
      if (
        !window.confirm(`Delete ${coordinates.path}? This creates a commit.`)
      ) {
        return
      }
      setDeleting(true)
      setError(null)
      try {
        await deleteEntry({ data: { ...coordinates, sha } })
        await router.navigate({ href: afterDeleteHref })
        void router.invalidate()
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : 'Could not delete entry',
        )
      } finally {
        setDeleting(false)
      }
    },
  }
}

function useEntryRename(
  coordinates: ContentEntryCoordinates,
  sha: string | null,
  renameBaseHref?: string,
) {
  const router = useRouter()
  const [renaming, setRenaming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return {
    renaming,
    error,
    async rename() {
      if (!renameBaseHref || !sha) return
      const current = coordinates.path.split('/').at(-1) ?? ''
      const filename = window.prompt('New filename', current)?.trim()
      if (!filename || filename === current) return
      setRenaming(true)
      setError(null)
      try {
        const result = await renameEntry({
          data: { ...coordinates, sha, filename },
        })
        await router.navigate({
          href: `${renameBaseHref}/${result.newPath.split('/').map(encodeURIComponent).join('/')}`,
        })
        void router.invalidate()
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : 'Could not rename entry',
        )
      } finally {
        setRenaming(false)
      }
    },
  }
}

function RawEntryEditor({
  initial,
  coordinates,
  afterDeleteHref,
  renameBaseHref,
}: {
  initial: EntryData
  coordinates: ContentEntryCoordinates
  afterDeleteHref: string
  renameBaseHref?: string
}) {
  const router = useRouter()
  const [source, setSource] = useState(initial.source)
  const [savedSource, setSavedSource] = useState(initial.source)
  const [sha, setSha] = useState(initial.sha)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dirty = source !== savedSource
  const deletion = useEntryDeletion(coordinates, sha, afterDeleteHref)
  const rename = useEntryRename(coordinates, sha, renameBaseHref)
  useUnsavedWarning(dirty)

  async function save() {
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      const result = await updateRawEntry({
        data: { ...coordinates, source, sha },
      })
      setSha(result.sha)
      setSavedSource(source)
      setSaved(true)
      void router.invalidate()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save entry')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <EditorHeader
        actionData={{
          label: initial.label,
          sha,
          content: savedSource,
        }}
        coordinates={coordinates}
        dirty={dirty}
        canDelete={initial.operations.delete && Boolean(sha)}
        initial={initial}
        saved={saved}
        saving={saving}
        deleting={deletion.deleting}
        canRename={
          initial.operations.rename && Boolean(renameBaseHref) && Boolean(sha)
        }
        renaming={rename.renaming}
        onDelete={() => void deletion.remove()}
        onRename={() => void rename.rename()}
        onSave={() => void save()}
      />
      <p className="text-sm text-muted-foreground">Source editor</p>
      <EditorError error={error ?? deletion.error ?? rename.error} />
      <Textarea
        aria-label="Entry source"
        className="min-h-[calc(100vh-13rem)] bg-card font-mono text-[13px] leading-6"
        spellCheck={false}
        value={source}
        onChange={(event) => {
          setSource(event.target.value)
          setSaved(false)
        }}
      />
    </div>
  )
}

function StructuredEntryEditor({
  initial,
  coordinates,
  afterDeleteHref,
  renameBaseHref,
}: {
  initial: Extract<EntryData, { mode: 'structured' }>
  coordinates: ContentEntryCoordinates
  afterDeleteHref: string
  renameBaseHref?: string
}) {
  const router = useRouter()
  const [content, setContent] = useState(initial.content)
  const [savedContent, setSavedContent] = useState(initial.content)
  const [sha, setSha] = useState(initial.sha)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dirty = JSON.stringify(content) !== JSON.stringify(savedContent)
  const fields = Array.isArray(initial.fields)
    ? initial.fields.filter(isContentField)
    : []
  const deletion = useEntryDeletion(coordinates, sha, afterDeleteHref)
  const rename = useEntryRename(coordinates, sha, renameBaseHref)
  useUnsavedWarning(dirty)

  async function save() {
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      const result = await updateStructuredEntry({
        data: { ...coordinates, content, sha },
      })
      setSha(result.sha)
      setSavedContent(content)
      setSaved(true)
      void router.invalidate()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save entry')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <EditorHeader
        actionData={{
          label: initial.label,
          sha,
          content: savedContent,
        }}
        coordinates={coordinates}
        dirty={dirty}
        canDelete={initial.operations.delete && Boolean(sha)}
        initial={initial}
        saved={saved}
        saving={saving}
        deleting={deletion.deleting}
        canRename={
          initial.operations.rename && Boolean(renameBaseHref) && Boolean(sha)
        }
        renaming={rename.renaming}
        onDelete={() => void deletion.remove()}
        onRename={() => void rename.rename()}
        onSave={() => void save()}
      />
      <EditorError error={error ?? deletion.error ?? rename.error} />
      <div className="space-y-5 rounded-xl border bg-card p-5 shadow-xs">
        {fields.map((field) => {
          const name = String(field.name)
          return (
            <StructuredContentField
              field={field}
              key={name}
              referenceContext={{ ...coordinates, media: initial.media }}
              value={content[name]}
              onChange={(value) => {
                setSaved(false)
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
      </div>
    </div>
  )
}

function EditorHeader({
  initial,
  coordinates,
  actionData,
  saving,
  saved,
  dirty,
  canDelete,
  canRename,
  deleting,
  renaming,
  onDelete,
  onRename,
  onSave,
}: {
  initial: EntryData
  coordinates: ContentEntryCoordinates
  actionData: Record<string, unknown>
  saving: boolean
  saved: boolean
  dirty: boolean
  canDelete: boolean
  canRename: boolean
  deleting: boolean
  renaming: boolean
  onDelete: () => void
  onRename: () => void
  onSave: () => void
}) {
  return (
    <header className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="truncate text-sm text-muted-foreground">{initial.path}</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          {initial.label}
        </h1>
      </div>
      <div className="flex gap-2">
        {initial.sha ? <EntryHistoryButton coordinates={coordinates} /> : null}
        <RepositoryActionButtons
          actions={initial.actions}
          context={{
            type: initial.actionContextType,
            name: coordinates.name,
            path: coordinates.path,
            data: actionData,
          }}
          coordinates={coordinates}
        />
        {canRename ? (
          <Button
            disabled={saving || deleting || renaming}
            variant="outline"
            onClick={onRename}
          >
            {renaming ? <LoaderCircle className="animate-spin" /> : <Pencil />}
            {renaming ? 'Renaming' : 'Rename'}
          </Button>
        ) : null}
        {canDelete ? (
          <Button
            disabled={saving || deleting || renaming}
            variant="destructive"
            onClick={onDelete}
          >
            {deleting ? <LoaderCircle className="animate-spin" /> : <Trash2 />}
            {deleting ? 'Deleting' : 'Delete'}
          </Button>
        ) : null}
        <Button
          disabled={saving || deleting || renaming || !dirty}
          onClick={onSave}
        >
          {saving ? (
            <LoaderCircle className="animate-spin" />
          ) : saved ? (
            <Check />
          ) : (
            <Save />
          )}
          {saving ? 'Saving' : 'Save'}
        </Button>
      </div>
    </header>
  )
}

function EntryHistoryButton({
  coordinates,
}: {
  coordinates: ContentEntryCoordinates
}) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState<
    Awaited<ReturnType<typeof getEntryHistory>> | undefined
  >()
  const [error, setError] = useState<string | null>(null)

  async function toggle() {
    if (open) {
      setOpen(false)
      return
    }
    setOpen(true)
    if (history) return
    setLoading(true)
    setError(null)
    try {
      setHistory(await getEntryHistory({ data: coordinates }))
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not load history',
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative">
      <Button
        aria-label="Entry history"
        size="icon"
        type="button"
        variant="outline"
        onClick={() => void toggle()}
      >
        {loading ? <LoaderCircle className="animate-spin" /> : <History />}
      </Button>
      {open ? (
        <div className="absolute right-0 top-full z-20 mt-2 w-80 rounded-xl border bg-popover p-3 text-popover-foreground shadow-lg">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 className="font-semibold">History</h2>
            <Button
              aria-label="Close history"
              size="icon"
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
            >
              <X />
            </Button>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading history…</p>
          ) : history?.length ? (
            <ul className="divide-y">
              {history.slice(0, 5).map((commit) => (
                <li key={commit.sha}>
                  <a
                    className="flex items-start gap-3 rounded-md px-2 py-2 hover:bg-muted"
                    href={commit.url}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {commit.message.split('\n')[0]}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {commit.authorName}
                        {commit.authoredAt
                          ? ` · ${new Date(commit.authoredAt).toLocaleString()}`
                          : ''}
                      </p>
                    </div>
                    <ExternalLink className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No history found.</p>
          )}
          <Button asChild className="mt-3 w-full" size="sm" variant="outline">
            <a
              href={`https://github.com/${encodeURIComponent(coordinates.owner)}/${encodeURIComponent(coordinates.repo)}/commits/${encodeURIComponent(coordinates.branch)}/${coordinates.path.split('/').map(encodeURIComponent).join('/')}`}
              rel="noreferrer"
              target="_blank"
            >
              View all on GitHub <ExternalLink />
            </a>
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function EditorError({ error }: { error: string | null }) {
  return error ? (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
      {error}
    </div>
  ) : null
}

export function ContentEntrySkeleton() {
  return (
    <div
      className="mx-auto h-[70vh] max-w-5xl animate-pulse rounded-xl border bg-card"
      aria-label="Loading entry"
    />
  )
}
