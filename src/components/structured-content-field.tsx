import { useEffect, useState } from 'react'

import { Input } from '#/components/ui/input'
import { Textarea } from '#/components/ui/textarea'
import { getReferenceOptions } from '#/functions/references'

import type { JsonObject, JsonValue } from '#/lib/json'

interface ReferenceContext {
  owner: string
  repo: string
  branch: string
}

export function isContentField(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function optionValues(field: JsonObject) {
  const options = isContentField(field.options) ? field.options : undefined
  if (!options || !Array.isArray(options.values)) return []
  return options.values.flatMap((option) => {
    if (typeof option === 'string' || typeof option === 'number') {
      return [{ label: String(option), value: option }]
    }
    if (isContentField(option)) {
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

export function StructuredContentField({
  field,
  value,
  referenceContext,
  onChange,
}: {
  field: JsonObject
  value: JsonValue | undefined
  referenceContext?: ReferenceContext
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
  } else if (type === 'reference' && referenceContext) {
    control = (
      <ReferenceFieldControl
        context={referenceContext}
        disabled={disabled}
        field={field}
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

function referenceValues(value: JsonValue | undefined, multiple: boolean) {
  const one = (item: JsonValue) =>
    isContentField(item) ? String(item.value ?? '') : String(item ?? '')
  return multiple
    ? (Array.isArray(value) ? value : []).map(one).filter(Boolean)
    : value === undefined || value === null || value === ''
      ? []
      : [one(value)]
}

function ReferenceFieldControl({
  context,
  field,
  value,
  disabled,
  onChange,
}: {
  context: ReferenceContext
  field: JsonObject
  value: JsonValue | undefined
  disabled: boolean
  onChange: (value: JsonValue | undefined) => void
}) {
  const settings = isContentField(field.options) ? field.options : {}
  const collection =
    typeof settings.collection === 'string' ? settings.collection : ''
  const multiple = settings.multiple === true
  const valueTemplate =
    typeof settings.value === 'string' ? settings.value : '{path}'
  const labelTemplate =
    typeof settings.label === 'string' ? settings.label : '{name}'
  const searchFieldsKey =
    typeof settings.search === 'string' && settings.search.trim()
      ? settings.search
      : 'name'
  const searchFields = searchFieldsKey
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  const selectedValues = referenceValues(value, multiple)
  const selectedKey = selectedValues.join('\0')
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState<
    Array<{ value: string; label: string }>
  >([])
  const [selectedOptions, setSelectedOptions] = useState<
    Array<{ value: string; label: string }>
  >([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!collection) return
    let cancelled = false
    const timer = window.setTimeout(async () => {
      setLoading(true)
      setError(null)
      try {
        const result = await getReferenceOptions({
          data: {
            ...context,
            collection,
            query,
            valueTemplate,
            labelTemplate,
            searchFields,
            selectedValues: [],
          },
        })
        if (!cancelled) setOptions(result)
      } catch (cause) {
        if (!cancelled) {
          setError(
            cause instanceof Error
              ? cause.message
              : 'Could not load references',
          )
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 200)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [
    collection,
    context.branch,
    context.owner,
    context.repo,
    labelTemplate,
    query,
    searchFieldsKey,
    valueTemplate,
  ])

  useEffect(() => {
    if (!collection || !selectedKey) {
      setSelectedOptions([])
      return
    }
    let cancelled = false
    void getReferenceOptions({
      data: {
        ...context,
        collection,
        query: '',
        valueTemplate,
        labelTemplate,
        searchFields,
        selectedValues,
      },
    })
      .then((result) => {
        if (!cancelled) setSelectedOptions(result)
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(
            cause instanceof Error
              ? cause.message
              : 'Could not resolve references',
          )
        }
      })
    return () => {
      cancelled = true
    }
  }, [
    collection,
    context.branch,
    context.owner,
    context.repo,
    labelTemplate,
    searchFieldsKey,
    selectedKey,
    valueTemplate,
  ])

  const merged = new Map(options.map((option) => [option.value, option]))
  for (const option of selectedOptions) merged.set(option.value, option)

  if (!collection) {
    return (
      <p className="text-sm text-destructive">
        Reference collection is missing.
      </p>
    )
  }
  return (
    <div className="space-y-2">
      {!disabled ? (
        <Input
          aria-label={`Search ${String(field.name)}`}
          placeholder="Search references…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      ) : null}
      <select
        aria-label={String(field.name)}
        className={
          multiple
            ? 'min-h-32 w-full rounded-lg border bg-background p-2 text-sm'
            : 'h-10 w-full rounded-lg border bg-background px-3 text-sm'
        }
        disabled={disabled}
        multiple={multiple}
        value={multiple ? selectedValues : (selectedValues[0] ?? '')}
        onChange={(event) => {
          if (multiple) {
            onChange(
              Array.from(event.target.selectedOptions).map(
                (option) => option.value,
              ),
            )
          } else {
            onChange(event.target.value || undefined)
          }
        }}
      >
        {!multiple ? <option value="">Select…</option> : null}
        {[...merged.values()].map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {loading ? (
        <p className="text-xs text-muted-foreground">Loading references…</p>
      ) : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  )
}
