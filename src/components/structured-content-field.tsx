import { lazy, Suspense, useEffect, useState } from 'react'
import { ClientOnly } from '@tanstack/react-router'
import { createClientOnlyFn } from '@tanstack/react-start'
import {
  ArrowDown,
  ArrowUp,
  ExternalLink,
  File,
  Folder,
  LoaderCircle,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
  X,
} from 'lucide-react'

import { Button } from '#/components/ui/button'
import { MediaThumbnail } from '#/components/media-thumbnail'
import { OperationError } from '#/components/operation-error'
import { Input } from '#/components/ui/input'
import { Textarea } from '#/components/ui/textarea'
import { getReferenceOptions } from '#/functions/references'
import { createMedia, getMedia } from '#/functions/media'
import { initializeStructuredContent } from '#/lib/field-values'
import {
  allowedMediaFieldExtensions,
  resolveFieldMedia,
} from '#/lib/media-field-values'
import { clientPluginRegistry } from '#/plugins/client-discovery'

import type { JsonObject, JsonValue } from '#/lib/json'

const loadRichTextField = createClientOnlyFn(
  () => import('#/components/rich-text-field'),
)
const RichTextField = lazy(loadRichTextField)

export interface ReferenceContext {
  owner: string
  repo: string
  branch: string
  media?: Array<{
    name: string
    label: string
    input: string
    output: string
    extensions: string[]
  }>
}

export function isContentField(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function optionValues(field: JsonObject) {
  const options = isContentField(field.options) ? field.options : undefined
  if (!options || !Array.isArray(options.values)) return []
  return options.values.flatMap((option) => {
    if (
      typeof option === 'string' ||
      typeof option === 'number' ||
      typeof option === 'boolean'
    ) {
      return [{ label: String(option), value: String(option) }]
    }
    if (isContentField(option)) {
      const value = option.value
      if (
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean'
      ) {
        return [
          {
            label:
              typeof option.label === 'string' ? option.label : String(value),
            value: String(value),
          },
        ]
      }
    }
    return []
  })
}

function SelectFieldControl({
  field,
  value,
  disabled,
  required,
  onChange,
}: {
  field: JsonObject
  value: JsonValue | undefined
  disabled: boolean
  required: boolean
  onChange: (value: JsonValue | undefined) => void
}) {
  const settings = isContentField(field.options) ? field.options : {}
  const options = optionValues(field)
  if (settings.multiple !== true) {
    return (
      <select
        aria-label={String(field.name)}
        className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
        disabled={disabled}
        required={required}
        value={value == null ? '' : String(value)}
        onChange={(event) => {
          const option = options.find(
            (candidate) => String(candidate.value) === event.target.value,
          )
          onChange(option?.value ?? event.target.value)
        }}
      >
        <option value="">Select…</option>
        {options.map((option) => (
          <option key={String(option.value)} value={String(option.value)}>
            {option.label}
          </option>
        ))}
      </select>
    )
  }

  const selected = Array.isArray(value) ? value : []
  const min = typeof settings.min === 'number' ? settings.min : 0
  const max =
    typeof settings.max === 'number' ? settings.max : Number.POSITIVE_INFINITY
  return (
    <div className="max-h-56 space-y-1 overflow-auto rounded-lg border bg-background p-2">
      {options.map((option) => {
        const checked = selected.includes(option.value)
        return (
          <label
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
            key={String(option.value)}
          >
            <input
              checked={checked}
              disabled={
                disabled ||
                (checked ? selected.length <= min : selected.length >= max)
              }
              type="checkbox"
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...selected, option.value]
                    : selected.filter((item) => item !== option.value),
                )
              }
            />
            <span>{option.label}</span>
          </label>
        )
      })}
      {!options.length ? (
        <p className="px-2 py-1 text-sm text-muted-foreground">
          No options configured.
        </p>
      ) : null}
    </div>
  )
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
  } else if (typeof field.component === 'string') {
    const PluginField = clientPluginRegistry.getField(field.component)
    control = PluginField ? (
      <PluginField
        disabled={disabled}
        field={field}
        required={required}
        value={value}
        onChange={onChange}
      />
    ) : (
      <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
        Field component “{field.component}” is not installed.
      </p>
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
  } else if (
    (type === 'image' || type === 'file') &&
    referenceContext?.media?.length &&
    (!isContentField(field.options) || field.options.media !== false)
  ) {
    control = (
      <MediaFieldControl
        context={referenceContext}
        disabled={disabled}
        field={field}
        image={type === 'image'}
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
  } else if (type === 'select') {
    control = (
      <SelectFieldControl
        disabled={disabled}
        field={field}
        required={required}
        value={value}
        onChange={onChange}
      />
    )
  } else if (type === 'rich-text') {
    control = (
      <ClientOnly
        fallback={
          <div className="min-h-48 animate-pulse rounded-lg border bg-muted/30" />
        }
      >
        <Suspense
          fallback={
            <div className="min-h-48 animate-pulse rounded-lg border bg-muted/30" />
          }
        >
          <RichTextField
            disabled={disabled}
            field={field}
            referenceContext={referenceContext}
            required={required}
            value={value}
            onChange={onChange}
          />
        </Suspense>
      </ClientOnly>
    )
  } else if (['text', 'code'].includes(type)) {
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

function mediaValues(value: JsonValue | undefined, multiple: boolean) {
  if (multiple) {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : []
  }
  return typeof value === 'string' && value ? [value] : []
}

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

function MediaFieldControl({
  context,
  field,
  value,
  disabled,
  image,
  onChange,
}: {
  context: ReferenceContext
  field: JsonObject
  value: JsonValue | undefined
  disabled: boolean
  image: boolean
  onChange: (value: JsonValue | undefined) => void
}) {
  const settings = isContentField(field.options) ? field.options : {}
  const media = resolveFieldMedia(field, context.media ?? [])
  const multiple =
    settings.multiple === true || isContentField(settings.multiple)
  const max = isContentField(settings.multiple)
    ? typeof settings.multiple.max === 'number'
      ? settings.multiple.max
      : Number.POSITIVE_INFINITY
    : multiple
      ? Number.POSITIVE_INFINITY
      : 1
  const selected = mediaValues(value, multiple)
  const [open, setOpen] = useState(false)
  const [path, setPath] = useState('')
  const [entries, setEntries] = useState<
    Array<{
      type: 'file' | 'dir'
      name: string
      path: string
      sha: string | null
      size: number | null
    }>
  >([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<unknown>(null)

  useEffect(() => {
    if (!open || !media) return
    let cancelled = false
    setLoading(true)
    setError(null)
    void getMedia({
      data: {
        owner: context.owner,
        repo: context.repo,
        branch: context.branch,
        name: media.name,
        path: path || media.input,
      },
    })
      .then((result) => {
        if (!cancelled) {
          setPath(result.media.path)
          setEntries(result.entries)
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [
    context.branch,
    context.owner,
    context.repo,
    media?.input,
    media?.name,
    open,
    path,
  ])

  if (!media) {
    return <p className="text-sm text-destructive">Media is not configured.</p>
  }
  const mediaName = media.name
  const mediaInput = media.input
  const configuredStartPath =
    typeof settings.path === 'string' &&
    (!mediaInput ||
      settings.path === mediaInput ||
      settings.path.startsWith(`${mediaInput}/`))
      ? settings.path
      : mediaInput
  const allowedExtensions = allowedMediaFieldExtensions(field, media)
  const visibleEntries = entries.filter(
    (entry) =>
      entry.type === 'dir' ||
      !allowedExtensions?.length ||
      allowedExtensions.includes(
        entry.name.split('.').at(-1)?.toLowerCase() ?? '',
      ),
  )

  function select(pathValue: string) {
    if (!multiple) {
      onChange(pathValue)
      setOpen(false)
      return
    }
    const next = [...new Set([...selected, pathValue])].slice(0, max)
    onChange(next)
  }

  async function upload(files: FileList | null) {
    if (!files?.length) return
    setUploading(true)
    setError(null)
    try {
      const uploaded: string[] = []
      for (const file of Array.from(files)) {
        if (file.size > 20 * 1024 * 1024) {
          throw new Error(`${file.name} exceeds the 20 MB limit`)
        }
        const extension = file.name.split('.').at(-1)?.toLowerCase() ?? ''
        if (
          allowedExtensions?.length &&
          !allowedExtensions.includes(extension)
        ) {
          throw new Error(`${file.name} uses a disallowed file extension`)
        }
        const result = await createMedia({
          data: {
            owner: context.owner,
            repo: context.repo,
            branch: context.branch,
            name: mediaName,
            path: path || mediaInput,
            filename: file.name,
            content: await fileBase64(file),
          },
        })
        uploaded.push(result.path)
        if (!multiple) break
      }
      if (multiple)
        onChange([...new Set([...selected, ...uploaded])].slice(0, max))
      else if (uploaded[0]) onChange(uploaded[0])
    } catch (cause) {
      setError(cause)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-3">
      {selected.length ? (
        <ul className="space-y-2">
          {selected.map((selectedPath) => (
            <li
              className="flex items-center gap-2 rounded-lg border bg-muted/20 px-3 py-2 text-sm"
              key={selectedPath}
            >
              {image ? (
                <MediaThumbnail
                  {...context}
                  className="size-10"
                  name={mediaName}
                  path={selectedPath}
                />
              ) : (
                <File className="size-4" />
              )}
              <span className="min-w-0 flex-1 truncate">{selectedPath}</span>
              <Button
                asChild
                aria-label={`Open ${selectedPath}`}
                size="icon"
                variant="ghost"
              >
                <a
                  href={`https://github.com/${encodeURIComponent(context.owner)}/${encodeURIComponent(context.repo)}/blob/${encodeURIComponent(context.branch)}/${selectedPath.split('/').map(encodeURIComponent).join('/')}`}
                  rel="noreferrer"
                  target="_blank"
                >
                  <ExternalLink />
                </a>
              </Button>
              {!disabled ? (
                <Button
                  aria-label={`Remove ${selectedPath}`}
                  size="icon"
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    const next = selected.filter(
                      (item) => item !== selectedPath,
                    )
                    onChange(multiple ? next : undefined)
                  }}
                >
                  <Trash2 />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No file selected.</p>
      )}
      {!disabled && selected.length < max ? (
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setPath(configuredStartPath)
              setOpen(true)
            }}
          >
            <Folder /> Select
          </Button>
          <Button asChild variant="outline">
            <label>
              {uploading ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <Upload />
              )}
              Upload
              <input
                accept={
                  allowedExtensions?.length
                    ? allowedExtensions
                        .map((extension) => `.${extension}`)
                        .join(',')
                    : undefined
                }
                className="sr-only"
                disabled={uploading}
                multiple={multiple}
                type="file"
                onChange={(event) => {
                  void upload(event.target.files)
                  event.target.value = ''
                }}
              />
            </label>
          </Button>
        </div>
      ) : null}
      {open ? (
        <div className="space-y-3 rounded-lg border bg-background p-3 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-xs text-muted-foreground">{path}</p>
            <Button
              aria-label="Close media browser"
              size="icon"
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
            >
              <X />
            </Button>
          </div>
          {path !== media.input ? (
            <Button
              size="sm"
              type="button"
              variant="outline"
              onClick={() => {
                const parts = path.split('/')
                parts.pop()
                const parent = parts.join('/')
                setPath(parent.startsWith(media.input) ? parent : media.input)
              }}
            >
              <ArrowUp /> Parent folder
            </Button>
          ) : null}
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading media…</p>
          ) : (
            <ul className="max-h-64 divide-y overflow-auto rounded-lg border">
              {visibleEntries.map((entry) => (
                <li key={entry.path}>
                  <button
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                    type="button"
                    onClick={() =>
                      entry.type === 'dir'
                        ? setPath(entry.path)
                        : select(entry.path)
                    }
                  >
                    {entry.type === 'dir' ? (
                      <Folder className="size-4" />
                    ) : image ? (
                      <MediaThumbnail
                        {...context}
                        className="size-8"
                        name={mediaName}
                        path={entry.path}
                      />
                    ) : (
                      <File className="size-4" />
                    )}
                    <span className="truncate">{entry.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <OperationError error={error} fallback="Could not load media." />
        </div>
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
  const max =
    typeof settings.max === 'number' ? settings.max : Number.POSITIVE_INFINITY
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
  const [error, setError] = useState<unknown>(null)

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
          setError(cause)
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
          setError(cause)
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
              Array.from(event.target.selectedOptions)
                .map((option) => option.value)
                .slice(0, max),
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
      <OperationError error={error} fallback="Could not load references." />
    </div>
  )
}
