import { useEffect, useState } from 'react'
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { Check, LoaderCircle, Save } from 'lucide-react'

import { Button } from '#/components/ui/button'
import { Textarea } from '#/components/ui/textarea'
import {
  StructuredContentField,
  isContentField,
} from '#/components/structured-content-field'
import {
  getRawEntry,
  updateRawEntry,
  updateStructuredEntry,
} from '#/functions/entry-editor'
import { getSignInUrl } from '#/lib/auth-redirect'

export const Route = createFileRoute(
  '/$owner/$repo/$branch/collection/$name/entry/$',
)({
  loader: async ({ params }) => {
    const path = params._splat
    if (!path) throw new Error('Entry path is required')
    try {
      return await getRawEntry({ data: { ...params, path } })
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'Authentication required'
      ) {
        throw redirect({
          href: getSignInUrl(
            `/${params.owner}/${params.repo}/${encodeURIComponent(params.branch)}/collection/${encodeURIComponent(params.name)}/entry/${path}`,
          ),
        })
      }
      throw error
    }
  },
  staleTime: 10_000,
  pendingMs: 100,
  pendingComponent: EntrySkeleton,
  component: EntryEditor,
})

function EntryEditor() {
  const initial = Route.useLoaderData()
  return initial.mode === 'structured' ? (
    <StructuredEntryEditor initial={initial} />
  ) : (
    <RawEntryEditor initial={initial} />
  )
}

function RawEntryEditor({ initial }: { initial: RouteLoaderData }) {
  const params = Route.useParams()
  const router = useRouter()
  const [source, setSource] = useState(initial.source)
  const [savedSource, setSavedSource] = useState(initial.source)
  const [sha, setSha] = useState(initial.sha)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dirty = source !== savedSource

  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  async function save() {
    if (!params._splat) return
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      const result = await updateRawEntry({
        data: { ...params, path: params._splat, source, sha },
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
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-sm text-muted-foreground">
            {initial.path}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {initial.label}
          </h1>
        </div>
        <Button disabled={saving || !dirty} onClick={() => void save()}>
          {saving ? (
            <LoaderCircle className="animate-spin" />
          ) : saved ? (
            <Check />
          ) : (
            <Save />
          )}
          {saving ? 'Saving' : 'Save'}
        </Button>
      </header>
      <p className="text-sm text-muted-foreground">Source editor</p>
      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}
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

type RouteLoaderData = Awaited<ReturnType<typeof getRawEntry>>

function StructuredEntryEditor({
  initial,
}: {
  initial: Extract<RouteLoaderData, { mode: 'structured' }>
}) {
  const params = Route.useParams()
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

  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  async function save() {
    if (!params._splat) return
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      const result = await updateStructuredEntry({
        data: { ...params, path: params._splat, content, sha },
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
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-sm text-muted-foreground">
            {initial.path}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {initial.label}
          </h1>
        </div>
        <Button disabled={saving || !dirty} onClick={() => void save()}>
          {saving ? (
            <LoaderCircle className="animate-spin" />
          ) : saved ? (
            <Check />
          ) : (
            <Save />
          )}
          {saving ? 'Saving' : 'Save'}
        </Button>
      </header>
      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}
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

function EntrySkeleton() {
  return (
    <div
      className="mx-auto h-[70vh] max-w-5xl animate-pulse rounded-xl border bg-card"
      aria-label="Loading entry"
    />
  )
}
