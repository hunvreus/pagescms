import { useEffect, useState } from 'react'

import { Input } from '#/components/ui/input'
import { Textarea } from '#/components/ui/textarea'

import type { JsonObject, JsonValue } from '#/lib/json'

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
