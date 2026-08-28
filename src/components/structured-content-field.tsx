import { lazy, Suspense, useEffect, useId, useRef, useState } from 'react'
import type { ComponentType, LazyExoticComponent } from 'react'
import { ClientOnly } from '@tanstack/react-router'
import { createClientOnlyFn } from '@tanstack/react-start'
import clientDeployment from '#pagescms/deployment/client'
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  ArrowUpRight,
  Asterisk,
  Ban,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  File,
  Folder,
  GripVertical,
  LoaderCircle,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react'

import { Button } from '#/components/ui/button'
import { Badge } from '#/components/ui/badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '#/components/ui/alert-dialog'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '#/components/ui/collapsible'
import { MediaThumbnail } from '#/components/media-thumbnail'
import { OperationError } from '#/components/operation-error'
import { Field, FieldDescription, FieldLabel } from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import { MediaPickerDialog } from '#/features/media/media-picker-dialog'
import { uploadMediaFiles } from '#/features/media/media-upload'
import { coreFieldRendererRegistry } from '#/features/editor/fields/core-field-renderers'
import {
  getListFieldOptions,
  getListItemSummary,
} from '#/features/editor/fields/structured-field-options'
import { getReferenceOptions } from '#/functions/references'
import { initializeStructuredContent } from '#/lib/field-values'
import {
  allowedMediaFieldExtensions,
  resolveFieldMedia,
} from '#/lib/media-field-values'

import type { JsonObject, JsonValue } from '#/lib/json'
import type { FieldRendererProps } from '#/features/editor/fields/field-renderer-registry'
import type { ReferenceContext } from '#/features/editor/fields/field-types'
import type { DeploymentFieldProps } from '#/deployment/contracts/client'

const loadRichTextField = createClientOnlyFn(
  () => import('#/components/rich-text-field'),
)
const RichTextField = lazy(loadRichTextField)
const loadCodeField = createClientOnlyFn(
  () => import('#/components/code-field'),
)
const CodeField = lazy(loadCodeField)
const deploymentFieldComponents = new Map<
  string,
  LazyExoticComponent<ComponentType<DeploymentFieldProps>>
>()

function getDeploymentFieldComponent(name: string) {
  const cached = deploymentFieldComponents.get(name)
  if (cached) return cached

  const loader = clientDeployment.fieldEditors?.[name]
  if (!loader) return null

  const component = lazy(loader)
  deploymentFieldComponents.set(name, component)
  return component
}

function RichTextRenderer({
  disabled,
  field,
  id,
  label,
  referenceContext,
  value,
  onChange,
  renderField,
}: FieldRendererProps) {
  const [mode, setMode] = useState<'editor' | 'source'>('editor')
  const [pendingUploads, setPendingUploads] = useState(0)
  const settings = isContentField(field.options) ? field.options : {}
  const headerActions =
    settings.switcher === false ? undefined : (
      <div className="inline-flex h-7 items-center rounded-md bg-muted p-0.5 text-muted-foreground">
        {(['editor', 'source'] as const).map((nextMode) => (
          <button
            className={`h-6 rounded-sm px-2 text-xs capitalize transition-colors hover:text-foreground ${mode === nextMode ? 'bg-background text-foreground shadow-xs' : ''}`}
            data-active={mode === nextMode || undefined}
            disabled={disabled || pendingUploads > 0}
            key={nextMode}
            type="button"
            onClick={() => setMode(nextMode)}
          >
            {nextMode === 'editor' ? 'Editor' : 'Source'}
          </button>
        ))}
      </div>
    )

  return renderField(
    <ClientOnly fallback={<DeferredEditorFallback />}>
      <Suspense fallback={<DeferredEditorFallback />}>
        <RichTextField
          disabled={disabled}
          field={field}
          id={id}
          label={label}
          mode={mode}
          referenceContext={referenceContext}
          value={value}
          onChange={onChange}
          onPendingUploadsChange={setPendingUploads}
        />
      </Suspense>
    </ClientOnly>,
    headerActions,
  )
}

function CodeRenderer({
  disabled,
  field,
  id,
  label,
  required,
  value,
  onChange,
  renderField,
}: FieldRendererProps) {
  return renderField(
    <ClientOnly fallback={<DeferredEditorFallback />}>
      <Suspense fallback={<DeferredEditorFallback />}>
        <CodeField
          disabled={disabled}
          field={field}
          id={id}
          label={label}
          required={required}
          value={value}
          onChange={onChange}
        />
      </Suspense>
    </ClientOnly>,
  )
}

function DeferredEditorFallback() {
  return (
    <div className="min-h-48 animate-pulse rounded-lg border bg-muted/30" />
  )
}

coreFieldRendererRegistry.register('rich-text', RichTextRenderer)
coreFieldRendererRegistry.register('code', CodeRenderer)

export type { ReferenceContext } from '#/features/editor/fields/field-types'

export function isContentField(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
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
    return null
  }
  return ''
}

function ConfirmRemoveButton({
  label,
  description,
  disabled = false,
  onConfirm,
}: {
  label: string
  description: string
  disabled?: boolean
  onConfirm: () => void
}) {
  if (disabled) {
    return (
      <Button
        aria-label={label}
        disabled
        size="icon-sm"
        type="button"
        variant="ghost"
      >
        <Trash2 />
      </Button>
    )
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button aria-label={label} size="icon-sm" type="button" variant="ghost">
          <Trash2 />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove this item?</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function SortableListItem({
  children,
  id,
  disabled,
}: {
  children: (handle: React.ReactNode) => React.ReactNode
  id: string
  disabled: boolean
}) {
  const sortable = useSortable({ id, disabled })
  const handle = disabled ? null : (
    <Button
      aria-label="Reorder item"
      className="cursor-grab touch-none active:cursor-grabbing"
      size="icon-sm"
      type="button"
      variant="ghost"
      {...sortable.attributes}
      {...sortable.listeners}
    >
      <GripVertical className="text-muted-foreground" />
    </Button>
  )

  return (
    <div
      ref={sortable.setNodeRef}
      style={{
        transform: CSS.Transform.toString(sortable.transform),
        transition: sortable.transition,
        opacity: sortable.isDragging ? 0.5 : 1,
      }}
    >
      {children(handle)}
    </div>
  )
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
  const options = getListFieldOptions(field)
  const itemField: JsonObject = { ...field, label: false, list: false }
  const listId = useId()
  const nextItemId = useRef(values.length)
  const [itemIds, setItemIds] = useState(() =>
    values.map((_, index) => `${listId}-${index}`),
  )
  const [openItems, setOpenItems] = useState(() =>
    values.map(() => !options.initiallyCollapsed),
  )
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  useEffect(() => {
    setItemIds((current) => {
      if (current.length === values.length) return current
      if (current.length > values.length) return current.slice(0, values.length)
      return [
        ...current,
        ...Array.from(
          { length: values.length - current.length },
          () => `${listId}-${nextItemId.current++}`,
        ),
      ]
    })
    setOpenItems((current) => {
      if (current.length === values.length) return current
      if (current.length > values.length) return current.slice(0, values.length)
      return [
        ...current,
        ...Array.from(
          { length: values.length - current.length },
          () => !options.initiallyCollapsed,
        ),
      ]
    })
  }, [listId, options.initiallyCollapsed, values.length])

  function update(index: number, next: JsonValue | undefined) {
    const copy = [...values]
    if (next === undefined) copy.splice(index, 1)
    else copy[index] = next
    onChange(copy)
  }

  function remove(index: number) {
    update(index, undefined)
    setItemIds((current) =>
      current.filter((_, itemIndex) => itemIndex !== index),
    )
    setOpenItems((current) =>
      current.filter((_, itemIndex) => itemIndex !== index),
    )
  }

  function reorder(activeId: string, overId: string) {
    const from = itemIds.indexOf(activeId)
    const to = itemIds.indexOf(overId)
    if (from < 0 || to < 0 || from === to) return
    onChange(arrayMove(values, from, to))
    setItemIds((current) => arrayMove(current, from, to))
    setOpenItems((current) => arrayMove(current, from, to))
  }

  return (
    <div className="space-y-2">
      {options.collapsible && values.length > 1 ? (
        <div className="flex justify-end">
          <Button
            size="sm"
            type="button"
            variant="ghost"
            onClick={() =>
              setOpenItems((current) =>
                current.map(() => current.some((open) => !open)),
              )
            }
          >
            {openItems.every(Boolean) ? <ChevronsDownUp /> : <ChevronsUpDown />}
            {openItems.every(Boolean) ? 'Collapse all' : 'Expand all'}
          </Button>
        </div>
      ) : null}
      <DndContext
        collisionDetection={closestCenter}
        id={`${listId}-dnd`}
        sensors={sensors}
        onDragEnd={({ active, over }) => {
          if (over) reorder(String(active.id), String(over.id))
        }}
      >
        <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {values.map((item, index) => (
              <SortableListItem
                disabled={disabled}
                id={itemIds[index] ?? `${listId}-${index}`}
                key={itemIds[index] ?? `${listId}-${index}`}
              >
                {(handle) =>
                  options.collapsible ? (
                    <Collapsible
                      className="rounded-lg border"
                      open={openItems[index] ?? !options.initiallyCollapsed}
                      onOpenChange={(open) =>
                        setOpenItems((current) =>
                          current.map((itemOpen, itemIndex) =>
                            itemIndex === index ? open : itemOpen,
                          ),
                        )
                      }
                    >
                      <div className="flex min-h-10 items-center gap-1 p-1">
                        {handle}
                        <CollapsibleTrigger asChild>
                          <button
                            className="group flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-medium hover:bg-muted"
                            type="button"
                          >
                            <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
                            <span className="truncate">
                              {getListItemSummary(field, item, index)}
                            </span>
                          </button>
                        </CollapsibleTrigger>
                        {!disabled ? (
                          <ConfirmRemoveButton
                            description="This removes the item and all of its nested fields."
                            disabled={values.length <= options.min}
                            label={`Remove item ${index + 1}`}
                            onConfirm={() => remove(index)}
                          />
                        ) : null}
                      </div>
                      <CollapsibleContent>
                        <div className="border-t p-4">
                          <StructuredContentField
                            field={itemField}
                            referenceContext={referenceContext}
                            value={item}
                            onChange={(next) => update(index, next)}
                          />
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  ) : (
                    <div className="flex items-start gap-1 rounded-lg border p-2">
                      {handle}
                      <div className="min-w-0 flex-1">
                        <StructuredContentField
                          field={itemField}
                          referenceContext={referenceContext}
                          value={item}
                          onChange={(next) => update(index, next)}
                        />
                      </div>
                      {!disabled ? (
                        <ConfirmRemoveButton
                          description="This removes the item from the list."
                          disabled={values.length <= options.min}
                          label={`Remove item ${index + 1}`}
                          onConfirm={() => remove(index)}
                        />
                      ) : null}
                    </div>
                  )
                }
              </SortableListItem>
            ))}
          </div>
        </SortableContext>
      </DndContext>
      {!disabled && values.length < options.max ? (
        <Button
          size="sm"
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
  embedded = false,
  onChange,
}: {
  field: JsonObject
  value: JsonValue | undefined
  referenceContext?: ReferenceContext
  embedded?: boolean
  onChange: (value: JsonValue) => void
}) {
  const object = isContentField(value) ? value : {}
  const fields = Array.isArray(field.fields)
    ? field.fields.filter(isContentField)
    : []
  return (
    <div className={embedded ? 'space-y-4' : 'space-y-4 rounded-lg border p-4'}>
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
  const object = isContentField(value) ? value : null
  const selectedName =
    object && typeof object[key] === 'string' ? object[key] : ''
  const selected = blocks.find((block) => block.name === selectedName)

  return (
    <div className="rounded-lg border">
      {selected && object ? (
        <>
          <div className="flex min-h-10 items-center justify-between gap-2 p-1 pl-3">
            <Badge variant="outline">
              {typeof selected.label === 'string'
                ? selected.label
                : selectedName}
            </Badge>
            {!disabled ? (
              <ConfirmRemoveButton
                description="This removes the selected block and all of its fields."
                label="Remove block"
                onConfirm={() => onChange(null)}
              />
            ) : null}
          </div>
          <div className="border-t p-4">
            <ObjectFieldControl
              embedded
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
          </div>
        </>
      ) : (
        <div className="space-y-3 p-4">
          <p className="text-sm font-medium">Choose a content block</p>
          <div className="flex flex-wrap gap-2">
            {blocks.map((block) => {
              const blockName = String(block.name)
              return (
                <Button
                  disabled={disabled}
                  key={blockName}
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={() =>
                    onChange({
                      [key]: blockName,
                      ...initializeStructuredContent(
                        Array.isArray(block.fields) ? block.fields : [],
                      ),
                    })
                  }
                >
                  {typeof block.label === 'string' ? block.label : blockName}
                </Button>
              )
            })}
          </div>
        </div>
      )}
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
  const controlId = useId()

  if (field.hidden === true) return null

  const renderField = (
    fieldControl: React.ReactNode,
    headerActions?: React.ReactNode,
  ) => (
    <Field>
      {label || required || disabled || headerActions ? (
        <div
          className="flex min-h-6 items-center justify-between gap-2"
          data-slot="field-header"
        >
          <div className="flex min-w-0 items-center gap-2">
            {label ? (
              <FieldLabel htmlFor={controlId}>{label}</FieldLabel>
            ) : null}
            {required ? (
              <Badge variant="secondary" className="text-muted-foreground">
                <Asterisk className="-ml-1 -mr-0.5" />
                Required
              </Badge>
            ) : null}
            {disabled ? (
              <Badge variant="secondary" className="text-muted-foreground">
                <Ban className="-ml-0.5" />
                Readonly
              </Badge>
            ) : null}
          </div>
          {headerActions ? (
            <div className="shrink-0" data-slot="field-header-actions">
              {headerActions}
            </div>
          ) : null}
        </div>
      ) : null}
      {fieldControl}
      {description ? <FieldDescription>{description}</FieldDescription> : null}
    </Field>
  )

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
    const PluginField = getDeploymentFieldComponent(field.component)
    control = PluginField ? (
      <Suspense fallback={<DeferredEditorFallback />}>
        <PluginField
          disabled={disabled}
          field={field}
          id={controlId}
          label={label ?? name}
          required={required}
          value={value}
          onChange={onChange}
        />
      </Suspense>
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
  } else {
    const CoreField = coreFieldRendererRegistry.resolve(type)
    return (
      <CoreField
        disabled={disabled}
        field={field}
        id={controlId}
        label={label ?? name}
        referenceContext={referenceContext}
        required={required}
        value={value}
        onChange={onChange}
        renderField={renderField}
      />
    )
  }

  return renderField(control)
}

function mediaValues(value: JsonValue | undefined, multiple: boolean) {
  if (multiple) {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : []
  }
  return typeof value === 'string' && value ? [value] : []
}

function ImageFieldThumbnail({
  context,
  draggable,
  id,
  mediaName,
  path,
  readonly,
  onRemove,
}: {
  context: ReferenceContext
  draggable: boolean
  id: string
  mediaName: string
  path: string
  readonly: boolean
  onRemove: () => void
}) {
  const sortable = useSortable({ id, disabled: readonly || !draggable })
  return (
    <div
      className="relative size-28"
      ref={sortable.setNodeRef}
      style={{
        transform: CSS.Transform.toString(sortable.transform),
        transition: sortable.transition,
        opacity: sortable.isDragging ? 0.5 : 1,
      }}
    >
      <div
        className={
          draggable && !readonly ? 'cursor-move touch-none' : undefined
        }
        title={path}
        {...sortable.attributes}
        {...sortable.listeners}
      >
        <MediaThumbnail
          {...context}
          className="size-28 rounded-md"
          name={mediaName}
          path={path}
        />
      </div>
      <div className="absolute right-1 bottom-1 flex rounded-md bg-background/95 p-0.5 shadow-sm backdrop-blur-sm">
        <Button
          asChild
          aria-label={`View ${path} on GitHub`}
          size="icon-xs"
          variant="ghost"
        >
          <a
            href={`https://github.com/${encodeURIComponent(context.owner)}/${encodeURIComponent(context.repo)}/blob/${encodeURIComponent(context.branch)}/${path.split('/').map(encodeURIComponent).join('/')}`}
            rel="noreferrer"
            target="_blank"
          >
            <ArrowUpRight className="text-muted-foreground" />
          </a>
        </Button>
        {!readonly ? (
          <Button
            aria-label={`Remove ${path}`}
            size="icon-xs"
            type="button"
            variant="ghost"
            onClick={onRemove}
          >
            <Trash2 className="text-muted-foreground" />
          </Button>
        ) : null}
      </div>
    </div>
  )
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
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const dndId = useId()
  const sensors = useSensors(useSensor(PointerSensor))

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
  function select(pathValue: string) {
    if (!multiple) {
      onChange(pathValue)
      setOpen(false)
      return
    }
    const next = selected.includes(pathValue)
      ? selected.filter((item) => item !== pathValue)
      : [...selected, pathValue].slice(-max)
    onChange(next)
  }

  async function upload(files: FileList | null) {
    if (!files?.length) return
    setUploading(true)
    setError(null)
    try {
      const uploaded = await uploadMediaFiles({
        coordinates: {
          owner: context.owner,
          repo: context.repo,
          branch: context.branch,
          name: mediaName,
        },
        extensions: allowedExtensions,
        files,
        limit: multiple ? Math.max(0, max - selected.length) : 1,
        path: configuredStartPath,
      })
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
    <div
      className="space-y-3"
      onDragOver={(event) => {
        if (!disabled && selected.length < max) event.preventDefault()
      }}
      onDrop={(event) => {
        if (disabled || selected.length >= max) return
        event.preventDefault()
        void upload(event.dataTransfer.files)
      }}
    >
      <OperationError error={error} fallback="Could not upload media." />
      {selected.length ? (
        image ? (
          <DndContext
            id={`${dndId}-media`}
            sensors={sensors}
            onDragEnd={({ active, over }) => {
              if (!over || active.id === over.id) return
              const oldIndex = selected.indexOf(String(active.id))
              const newIndex = selected.indexOf(String(over.id))
              if (oldIndex >= 0 && newIndex >= 0)
                onChange(arrayMove(selected, oldIndex, newIndex))
            }}
          >
            <SortableContext items={selected} strategy={rectSortingStrategy}>
              <div className="flex flex-wrap gap-2">
                {selected.map((selectedPath) => (
                  <ImageFieldThumbnail
                    context={context}
                    draggable={multiple}
                    id={selectedPath}
                    key={selectedPath}
                    mediaName={mediaName}
                    path={selectedPath}
                    readonly={disabled}
                    onRemove={() => {
                      const next = selected.filter(
                        (item) => item !== selectedPath,
                      )
                      onChange(multiple ? next : undefined)
                    }}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        ) : (
          <ul className="space-y-2">
            {selected.map((selectedPath) => (
              <li
                className="flex items-center gap-2 rounded-lg border bg-muted/20 px-3 py-2 text-sm"
                key={selectedPath}
              >
                <File className="size-4" />
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
                    <ArrowUpRight className="text-muted-foreground" />
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
        )
      ) : (
        <p className="text-sm text-muted-foreground">No file selected.</p>
      )}
      {!disabled && selected.length < max ? (
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => setOpen(true)}>
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
      <MediaPickerDialog
        coordinates={{
          owner: context.owner,
          repo: context.repo,
          branch: context.branch,
          name: mediaName,
        }}
        extensions={allowedExtensions}
        open={open}
        rootPath={configuredStartPath}
        selected={selected}
        selectionLimit={max}
        title={image ? 'Choose images' : 'Choose files'}
        onOpenChange={setOpen}
        onSelect={select}
        onSelectMany={(paths) => {
          if (!multiple) {
            if (paths[0]) onChange(paths[0])
            setOpen(false)
            return
          }
          onChange([...new Set([...selected, ...paths])].slice(0, max))
        }}
      />
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
