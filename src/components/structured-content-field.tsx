import { useEffect, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  ExternalLink,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react'

import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Textarea } from '#/components/ui/textarea'
import { getReferenceOptions } from '#/functions/references'
import { initializeStructuredContent } from '#/lib/field-values'

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

function fieldListLimits(field: JsonObject) {
  const list = isContentField(field.list) ? field.list : {}
  return {
    min: typeof list.min === 'number' ? list.min : 0,
    max: typeof list.max === 'number' ? list.max : Number.POSITIVE_INFINITY,
  }
}

function initialFieldValue(field: JsonObject): JsonValue {
  if ('default' in field) return field.default
  if (field.type === 'boolean') return false
  if (field.type === 'number') return 0
  if (field.type === 'uuid') return crypto.randomUUID()
  if (field.type === 'object') {
    return initializeStructuredContent(
      Array.isArray(field.fields) ? field.fields : [],
    )
  }
  if (field.type === 'block') {
    const block = Array.isArray(field.blocks)
      ? field.blocks.find(isContentField)
      : undefined
    const blockName = typeof block?.name === 'string' ? block.name : ''
    const key = typeof field.blockKey === 'string' ? field.blockKey : '_block'
    return {
      [key]: blockName,
      ...initializeStructuredContent(
        Array.isArray(block?.fields) ? block.fields : [],
      ),
    }
  }
  return ''
}

function ListFieldControl({
  field,
  value,
  disabled,
  referenceContext,
  onChange,
}: {
  field: JsonObject
  value: JsonValue | undefined
  disabled: boolean
  referenceContext?: ReferenceContext
  onChange: (value: JsonValue) => void
}) {
  const values = Array.isArray(value) ? value : []
  const limits = fieldListLimits(field)
  const itemField: JsonObject = { ...field, label: false, list: false }

  function update(index: number, next: JsonValue | undefined) {
    const copy = [...values]
    if (next === undefined) copy.splice(index, 1)
    else copy[index] = next
    onChange(copy)
  }

  function move(index: number, offset: number) {
    const target = index + offset
    if (target < 0 || target >= values.length) return
    const copy = [...values]
    const current = copy[index]
    copy[index] = copy[target]!
    copy[target] = current!
    onChange(copy)
  }

  return (
    <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
      {values.map((item, index) => (
        <div
          className="space-y-3 rounded-lg border bg-background p-3"
          key={index}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              Item {index + 1}
            </span>
            {!disabled ? (
              <div className="flex gap-1">
                <Button
                  aria-label={`Move item ${index + 1} up`}
                  disabled={index === 0}
                  size="icon"
                  type="button"
                  variant="ghost"
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp />
                </Button>
                <Button
                  aria-label={`Move item ${index + 1} down`}
                  disabled={index === values.length - 1}
                  size="icon"
                  type="button"
                  variant="ghost"
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown />
                </Button>
                <Button
                  aria-label={`Remove item ${index + 1}`}
                  disabled={values.length <= limits.min}
                  size="icon"
                  type="button"
                  variant="ghost"
                  onClick={() => update(index, undefined)}
                >
                  <Trash2 />
                </Button>
              </div>
            ) : null}
          </div>
          <StructuredContentField
            field={itemField}
            referenceContext={referenceContext}
            value={item}
            onChange={(next) => update(index, next)}
          />
        </div>
      ))}
      {!disabled && values.length < limits.max ? (
        <Button
          type="button"
          variant="outline"
          onClick={() => onChange([...values, initialFieldValue(field)])}
        >
          <Plus /> Add item
        </Button>
      ) : null}
      {!values.length ? (
        <p className="text-sm text-muted-foreground">No items.</p>
      ) : null}
    </div>
  )
}

function ObjectFieldControl({
  field,
  value,
  referenceContext,
  onChange,
}: {
  field: JsonObject
  value: JsonValue | undefined
  referenceContext?: ReferenceContext
  onChange: (value: JsonValue) => void
}) {
  const object = isContentField(value) ? value : {}
  const fields = Array.isArray(field.fields)
    ? field.fields.filter(isContentField)
    : []
  return (
    <div className="space-y-4 rounded-lg border bg-muted/20 p-4">
      {fields.map((child) => {
        const name = String(child.name)
        return (
          <StructuredContentField
            field={
              field.readonly === true ? { ...child, readonly: true } : child
            }
            key={name}
            referenceContext={referenceContext}
            value={object[name]}
            onChange={(next) => {
              const copy = { ...object }
              if (next === undefined) delete copy[name]
              else copy[name] = next
              onChange(copy)
            }}
          />
        )
      })}
    </div>
  )
}

function BlockFieldControl({
  field,
  value,
  disabled,
  referenceContext,
  onChange,
}: {
  field: JsonObject
  value: JsonValue | undefined
  disabled: boolean
  referenceContext?: ReferenceContext
  onChange: (value: JsonValue) => void
}) {
  const blocks = Array.isArray(field.blocks)
    ? field.blocks.filter(isContentField)
    : []
  const key = typeof field.blockKey === 'string' ? field.blockKey : '_block'
  const object = isContentField(value) ? value : {}
  const selectedName = typeof object[key] === 'string' ? object[key] : ''
  const selected = blocks.find((block) => block.name === selectedName)

  return (
    <div className="space-y-4 rounded-lg border bg-muted/20 p-4">
      <select
        aria-label={`${String(field.name)} block type`}
        className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
        disabled={disabled}
        value={selectedName}
        onChange={(event) => {
          const block = blocks.find(
            (candidate) => candidate.name === event.target.value,
          )
          onChange({
            [key]: event.target.value,
            ...initializeStructuredContent(
              Array.isArray(block?.fields) ? block.fields : [],
            ),
          })
        }}
      >
        <option value="">Select block…</option>
        {blocks.map((block) => (
          <option key={String(block.name)} value={String(block.name)}>
            {typeof block.label === 'string' ? block.label : String(block.name)}
          </option>
        ))}
      </select>
      {selected ? (
        <ObjectFieldControl
          field={{ ...selected, readonly: disabled }}
          referenceContext={referenceContext}
          value={object}
          onChange={(next) =>
            onChange({
              ...(isContentField(next) ? next : {}),
              [key]: selectedName,
            })
          }
        />
      ) : null}
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

  if (field.hidden === true) return null

  let control: React.ReactNode
  if (field.list) {
    control = (
      <ListFieldControl
        disabled={disabled}
        field={field}
        referenceContext={referenceContext}
        value={value}
        onChange={onChange}
      />
    )
  } else if (type === 'object') {
    control = (
      <ObjectFieldControl
        field={field}
        referenceContext={referenceContext}
        value={value}
        onChange={onChange}
      />
    )
  } else if (type === 'block') {
    control = (
      <BlockFieldControl
        disabled={disabled}
        field={field}
        referenceContext={referenceContext}
        value={value}
        onChange={onChange}
      />
    )
  } else if (type === 'uuid') {
    const options = isContentField(field.options) ? field.options : {}
    control = (
      <div className="flex gap-2">
        <Input
          aria-label={name}
          disabled={disabled}
          readOnly={options.editable !== true}
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => onChange(event.target.value)}
        />
        {options.generate !== false ? (
          <Button
            aria-label={`Generate ${name}`}
            disabled={disabled}
            size="icon"
            type="button"
            variant="outline"
            onClick={() => onChange(crypto.randomUUID())}
          >
            <RefreshCw />
          </Button>
        ) : null}
      </div>
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
    const options = isContentField(field.options) ? field.options : {}
    control = (
      <div className="flex gap-2">
        <Input
          aria-label={name}
          disabled={disabled}
          max={
            typeof options.max === 'number' || typeof options.max === 'string'
              ? options.max
              : undefined
          }
          min={
            typeof options.min === 'number' || typeof options.min === 'string'
              ? options.min
              : undefined
          }
          required={required}
          step={typeof options.step === 'number' ? options.step : undefined}
          type={
            type === 'number'
              ? 'number'
              : type === 'date'
                ? options.time === true
                  ? 'datetime-local'
                  : 'date'
                : 'text'
          }
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
        {(type === 'image' || type === 'file') &&
        typeof value === 'string' &&
        value ? (
          <Button
            asChild
            aria-label={`Open ${name} on GitHub`}
            variant="outline"
          >
            <a
              href={`https://github.com/${encodeURIComponent(referenceContext?.owner ?? '')}/${encodeURIComponent(referenceContext?.repo ?? '')}/blob/${encodeURIComponent(referenceContext?.branch ?? '')}/${value.split('/').map(encodeURIComponent).join('/')}`}
              rel="noreferrer"
              target="_blank"
            >
              <ExternalLink />
            </a>
          </Button>
        ) : null}
      </div>
    )
  }

  return (
    <div className="block space-y-2">
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
    </div>
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
