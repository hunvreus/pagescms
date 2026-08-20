import { useEffect, useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { Check, LoaderCircle, Save, Trash2 } from 'lucide-react'

import {
  StructuredContentField,
  isContentField,
} from '#/components/structured-content-field'
import { Button } from '#/components/ui/button'
import { Textarea } from '#/components/ui/textarea'
import {
  deleteEntry,
  updateRawEntry,
  updateStructuredEntry,
} from '#/functions/entry-editor'
import type { getRawEntry } from '#/functions/entry-editor'

type EntryData = Awaited<ReturnType<typeof getRawEntry>>

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
}: {
  initial: EntryData
  coordinates: ContentEntryCoordinates
  afterDeleteHref: string
}) {
  return initial.mode === 'structured' ? (
    <StructuredEntryEditor
      afterDeleteHref={afterDeleteHref}
      coordinates={coordinates}
      initial={initial}
    />
  ) : (
    <RawEntryEditor
      afterDeleteHref={afterDeleteHref}
      coordinates={coordinates}
      initial={initial}
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
  sha: string,
  afterDeleteHref: string,
) {
  const router = useRouter()
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return {
    deleting,
    error,
    async remove() {
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

function RawEntryEditor({
  initial,
  coordinates,
  afterDeleteHref,
}: {
  initial: EntryData
  coordinates: ContentEntryCoordinates
  afterDeleteHref: string
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
        dirty={dirty}
        canDelete={initial.operations.delete}
        initial={initial}
        saved={saved}
        saving={saving}
        deleting={deletion.deleting}
        onDelete={() => void deletion.remove()}
        onSave={() => void save()}
      />
      <p className="text-sm text-muted-foreground">Source editor</p>
      <EditorError error={error ?? deletion.error} />
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
}: {
  initial: Extract<EntryData, { mode: 'structured' }>
  coordinates: ContentEntryCoordinates
  afterDeleteHref: string
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
        dirty={dirty}
        canDelete={initial.operations.delete}
        initial={initial}
        saved={saved}
        saving={saving}
        deleting={deletion.deleting}
        onDelete={() => void deletion.remove()}
        onSave={() => void save()}
      />
      <EditorError error={error ?? deletion.error} />
      <div className="space-y-5 rounded-xl border bg-card p-5 shadow-xs">
        {fields.map((field) => {
          const name = String(field.name)
          return (
            <StructuredContentField
              field={field}
              key={name}
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
  saving,
  saved,
  dirty,
  canDelete,
  deleting,
  onDelete,
  onSave,
}: {
  initial: EntryData
  saving: boolean
  saved: boolean
  dirty: boolean
  canDelete: boolean
  deleting: boolean
  onDelete: () => void
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
        {canDelete ? (
          <Button
            disabled={saving || deleting}
            variant="destructive"
            onClick={onDelete}
          >
            {deleting ? <LoaderCircle className="animate-spin" /> : <Trash2 />}
            {deleting ? 'Deleting' : 'Delete'}
          </Button>
        ) : null}
        <Button disabled={saving || deleting || !dirty} onClick={onSave}>
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
