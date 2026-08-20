import { useEffect, useState } from 'react'
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { Check, LoaderCircle, Save } from 'lucide-react'

import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Textarea } from '#/components/ui/textarea'
import {
  getRawEntry,
  updateRawEntry,
  updateStructuredEntry,
} from '#/functions/entry-editor'
import { getSignInUrl } from '#/lib/auth-redirect'

import type { JsonObject, JsonValue } from '#/lib/json'

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

function isRecord(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function optionValues(field: JsonObject) {
  const options = isRecord(field.options) ? field.options : undefined
  if (!options || !Array.isArray(options.values)) return []
  return options.values.flatMap((option) => {
    if (typeof option === 'string' || typeof option === 'number') {
      return [{ label: String(option), value: option }]
    }
    if (isRecord(option)) {
      const value = option.value
      if (typeof value === 'string' || typeof value === 'number') {
        return [
          {
            label:
              typeof option.label === 'string' ? option.label : String(value),
            value,
          },
        ]
      }
    }
    return []
  })
}

function JsonFieldControl({
  name,
  value,
  disabled,
  fallback,
  onChange,
}: {
  name: string
  value: JsonValue | undefined
  disabled: boolean
  fallback: JsonValue
  onChange: (value: JsonValue) => void
}) {
  const serialized = JSON.stringify(value ?? fallback, null, 2)
  const [draft, setDraft] = useState(serialized)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => setDraft(serialized), [serialized])

  return (
    <div className="space-y-1.5">
      <Textarea
        aria-label={name}
        className="min-h-28 font-mono text-sm"
        disabled={disabled}
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value)
          try {
            onChange(JSON.parse(event.target.value) as JsonValue)
            setError(null)
          } catch {
            setError('Enter valid JSON')
          }
        }}
      />
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  )
}

function StructuredField({
  field,
  value,
  onChange,
}: {
  field: JsonObject
  value: JsonValue | undefined
  onChange: (value: JsonValue | undefined) => void
}) {
  const name = String(field.name)
  const type = typeof field.type === 'string' ? field.type : 'string'
  const label =
    field.label === false
      ? null
      : typeof field.label === 'string'
        ? field.label
        : name
  const disabled = field.readonly === true
  const required = field.required === true
  const description =
    typeof field.description === 'string' ? field.description : null

  let control: React.ReactNode
  if (field.list || type === 'object' || type === 'block') {
    control = (
      <JsonFieldControl
        disabled={disabled}
        fallback={field.list ? [] : {}}
        name={name}
        value={value}
        onChange={onChange}
      />
    )
  } else if (type === 'boolean') {
    control = (
      <input
        aria-label={name}
        checked={value === true}
        className="size-4 rounded border"
        disabled={disabled}
        type="checkbox"
        onChange={(event) => onChange(event.target.checked)}
      />
    )
  } else if (type === 'select' && optionValues(field).length) {
    control = (
      <select
        aria-label={name}
        className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
        disabled={disabled}
        required={required}
        value={value == null ? '' : String(value)}
        onChange={(event) => {
          const option = optionValues(field).find(
            (candidate) => String(candidate.value) === event.target.value,
          )
          onChange(option?.value ?? event.target.value)
        }}
      >
        <option value="">Select…</option>
        {optionValues(field).map((option) => (
          <option key={String(option.value)} value={String(option.value)}>
            {option.label}
          </option>
        ))}
      </select>
    )
  } else if (['text', 'rich-text', 'code'].includes(type)) {
    control = (
      <Textarea
        aria-label={name}
        className={type === 'code' ? 'min-h-48 font-mono' : 'min-h-32'}
        disabled={disabled}
        required={required}
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(event.target.value)}
      />
    )
  } else {
    control = (
      <Input
        aria-label={name}
        disabled={disabled}
        required={required}
        type={type === 'number' ? 'number' : type === 'date' ? 'date' : 'text'}
        value={
          typeof value === 'string' || typeof value === 'number' ? value : ''
        }
        onChange={(event) => {
          if (type === 'number') {
            onChange(
              event.target.value === ''
                ? undefined
                : event.target.valueAsNumber,
            )
          } else {
            onChange(event.target.value)
          }
        }}
      />
    )
  }

  return (
    <label className="block space-y-2">
      {label ? (
        <span className="text-sm font-medium">
          {label}
          {required ? <span className="text-destructive"> *</span> : null}
        </span>
      ) : null}
      {control}
      {description ? (
        <span className="block text-xs text-muted-foreground">
          {description}
        </span>
      ) : null}
    </label>
  )
}

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
    ? initial.fields.filter(isRecord)
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
            <StructuredField
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
