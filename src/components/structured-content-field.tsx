import { lazy, Suspense, useEffect, useId, useRef, useState } from 'react'
import { isContentField } from '#/lib/content-field'
import type { ComponentType, CSSProperties, LazyExoticComponent } from 'react'
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
import type { Transform } from '@dnd-kit/utilities'
import {
  ArrowUpRight,
  Asterisk,
  Ban,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  File,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileType,
  FileVideo,
  Folder,
  GripVertical,
  LoaderCircle,
  Plus,
  Trash2,
  Upload,
  X,
} from 'lucide-react'

import { Button } from '#/components/ui/button'
import { useRepositoryGitHubLink } from '#/hooks/use-repository-github-link'
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
import { ErrorAlert } from '#/components/error-alert'
import { Field, FieldDescription, FieldLabel } from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/tabs'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '#/components/ui/tooltip'
import { MediaPickerDialog } from '#/features/media/media-picker-dialog'
import { uploadMediaFiles } from '#/features/media/media-upload'
import { coreFieldRendererRegistry } from '#/features/editor/fields/core-field-renderers'
import {
  getListFieldOptions,
  getListItemSummary,
} from '#/features/editor/fields/structured-field-options'
import { getReferenceOptions } from '#/functions/references'
import { initializeStructuredContent } from '#/lib/field-values'
import { parseUploadRename } from '#/lib/media-upload-name'
import { customFieldEditors } from '#/features/editor/fields/custom-field-components'
import {
  allowedMediaFieldExtensions,
  relativeMediaPath,
  resolveFieldMedia,
} from '#/lib/media-field-values'
import { extensionCategories, getFileExtension } from '#/lib/file-types'

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

function MediaFileIcon({ path }: { path: string }) {
  const icons = {
    image: FileImage,
    document: FileText,
    video: FileVideo,
    audio: FileAudio,
    compressed: FileArchive,
    code: FileCode,
    font: FileType,
    spreadsheet: FileSpreadsheet,
  }
  const extension = getFileExtension(path).toLowerCase()
  const category = Object.keys(extensionCategories).find((key) =>
    (
      extensionCategories[
        key as keyof typeof extensionCategories
      ] as readonly string[]
    ).includes(extension),
  ) as keyof typeof icons | undefined
  const Icon = category ? icons[category] : File
  return <Icon className="size-4 shrink-0" />
}

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
      <TabsList
        aria-label={`${label} mode`}
        className="group-data-horizontal/tabs:h-7"
      >
        {(['editor', 'source'] as const).map((nextMode) => (
          <TabsTrigger
            className="px-2 text-xs"
            disabled={disabled || pendingUploads > 0}
            key={nextMode}
            value={nextMode}
          >
            {nextMode === 'editor' ? 'Editor' : 'Source'}
          </TabsTrigger>
        ))}
      </TabsList>
    )

  return (
    <Tabs
      value={mode}
      onValueChange={(next) => setMode(next as 'editor' | 'source')}
    >
      {renderField(
        <TabsContent value={mode}>
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
          </ClientOnly>
        </TabsContent>,
        headerActions,
      )}
    </Tabs>
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

function MountedGroupContent({
  open,
  children,
}: {
  open: boolean
  children: React.ReactNode
}) {
  const [mounted, setMounted] = useState(open)
  useEffect(() => {
    if (open) setMounted(true)
  }, [open])

  return (
    <CollapsibleContent forceMount hidden={!open}>
      {open || mounted ? children : null}
    </CollapsibleContent>
  )
}

function selectedFieldBlock(field: JsonObject, value: JsonValue | undefined) {
  const key = typeof field.blockKey === 'string' ? field.blockKey : '_block'
  if (field.type !== 'block' || !isContentField(value)) return undefined
  return Array.isArray(field.blocks)
    ? field.blocks
        .filter(isContentField)
        .find((block) => block.name === value[key])
    : undefined
}

coreFieldRendererRegistry.register('rich-text', RichTextRenderer)
coreFieldRendererRegistry.register('code', CodeRenderer)

export type { ReferenceContext } from '#/features/editor/fields/field-types'

function initialFieldValue(field: JsonObject): JsonValue {
  const initialized = initializeStructuredContent([
    { ...field, name: 'value', list: false },
  ])
  if ('value' in initialized) return initialized.value
  if (field.type === 'number') return 0
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
  kind = 'item',
  disabled = false,
  onConfirm,
}: {
  label: string
  description: string
  kind?: 'item' | 'block'
  disabled?: boolean
  onConfirm: () => void
}) {
  const Icon = kind === 'block' ? X : Trash2
  const tooltip = kind === 'block' ? 'Reset block' : 'Remove item'
  if (disabled) {
    return (
      <Button
        aria-label={label}
        className="text-muted-foreground hover:text-foreground"
        disabled
        size="icon-sm"
        type="button"
        variant="ghost"
      >
        <Icon />
      </Button>
    )
  }

  return (
    <AlertDialog>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <AlertDialogTrigger asChild>
              <Button
                aria-label={label}
                className="text-muted-foreground hover:text-foreground"
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <Icon />
              </Button>
            </AlertDialogTrigger>
          </TooltipTrigger>
          <TooltipContent>{tooltip}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {kind === 'block' ? 'Reset this block?' : 'Remove this item?'}
          </AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            {kind === 'block' ? 'Reset' : 'Remove'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export function sortableItemStyle(
  transform: Transform | null,
  transition: string | undefined,
  dragging: boolean,
): CSSProperties {
  return {
    transform: CSS.Translate.toString(transform),
    transition,
    position: 'relative',
    zIndex: dragging ? 1 : undefined,
  }
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
      className="cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
      size="icon-sm"
      type="button"
      variant="ghost"
      {...sortable.attributes}
      {...sortable.listeners}
    >
      <GripVertical />
    </Button>
  )

  return (
    <div
      ref={sortable.setNodeRef}
      style={sortableItemStyle(
        sortable.transform,
        sortable.transition,
        sortable.isDragging,
      )}
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
  renderField,
}: {
  field: JsonObject
  value: JsonValue | undefined
  disabled: boolean
  referenceContext?: ReferenceContext
  onChange: (value: JsonValue) => void
  renderField: FieldRendererProps['renderField']
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

  const headerActions =
    options.collapsible && values.length > 1 ? (
      <Button
        className="text-muted-foreground hover:text-foreground"
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
    ) : undefined

  return renderField(
    <div className="space-y-2">
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
            {values.map((item, index) => {
              const selectedBlock = selectedFieldBlock(field, item)
              return (
                <SortableListItem
                  disabled={disabled}
                  id={itemIds[index] ?? `${listId}-pending-${index}`}
                  key={itemIds[index] ?? `${listId}-pending-${index}`}
                >
                  {(handle) =>
                    options.collapsible ? (
                      <Collapsible
                        className="rounded-xl border bg-card"
                        open={openItems[index] ?? !options.initiallyCollapsed}
                        onOpenChange={(open) =>
                          setOpenItems((current) =>
                            current.map((itemOpen, itemIndex) =>
                              itemIndex === index ? open : itemOpen,
                            ),
                          )
                        }
                      >
                        <div className="flex min-h-10 items-center p-1">
                          {handle}
                          <CollapsibleTrigger asChild>
                            <Button
                              className="min-w-0 flex-1 justify-start text-left text-sm aria-expanded:bg-transparent aria-expanded:hover:bg-muted dark:aria-expanded:hover:bg-muted/50"
                              size="sm"
                              variant="ghost"
                              type="button"
                            >
                              <ChevronRight className="text-muted-foreground transition-transform group-data-[state=open]/button:rotate-90" />
                              <span className="truncate">
                                {getListItemSummary(field, item, index)}
                              </span>
                            </Button>
                          </CollapsibleTrigger>
                          {selectedBlock ? (
                            <>
                              <Badge
                                variant="outline"
                                className="text-muted-foreground"
                              >
                                {String(
                                  selectedBlock.label ?? selectedBlock.name,
                                )}
                              </Badge>
                              {!disabled ? (
                                <ConfirmRemoveButton
                                  kind="block"
                                  description="This clears the selected block and its fields, keeping the list item so you can choose another block."
                                  label={`Reset block in item ${index + 1}`}
                                  onConfirm={() => update(index, null)}
                                />
                              ) : null}
                            </>
                          ) : null}
                          {!disabled ? (
                            <ConfirmRemoveButton
                              description="This removes the item and all of its nested fields."
                              disabled={values.length <= options.min}
                              label={`Remove item ${index + 1}`}
                              onConfirm={() => remove(index)}
                            />
                          ) : null}
                        </div>
                        <MountedGroupContent
                          open={openItems[index] ?? !options.initiallyCollapsed}
                        >
                          <div className="border-t p-4">
                            <StructuredContentField
                              embedded
                              hideMetadata
                              blockHeaderInList
                              field={itemField}
                              referenceContext={referenceContext}
                              value={item}
                              onChange={(next) => update(index, next)}
                            />
                          </div>
                        </MountedGroupContent>
                      </Collapsible>
                    ) : (
                      <div className="flex items-start gap-1 rounded-xl border bg-card p-4">
                        {handle}
                        <div className="min-w-0 flex-1">
                          <StructuredContentField
                            embedded
                            hideMetadata
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
              )
            })}
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
    </div>,
    headerActions,
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
    <div
      className={
        embedded ? 'space-y-4' : 'space-y-4 rounded-xl border bg-card p-4'
      }
    >
      {fields.map((child) => {
        const name = String(child.name)
        return (
          <StructuredContentField
            inheritedReadonly={
              field.readonly === true && child.readonly !== true
            }
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
  embedded = false,
  headerInList = false,
  onChange,
}: {
  field: JsonObject
  value: JsonValue | undefined
  disabled: boolean
  referenceContext?: ReferenceContext
  embedded?: boolean
  headerInList?: boolean
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
    <div className={embedded ? undefined : 'rounded-xl border bg-card'}>
      {selected && object ? (
        <>
          {!headerInList ? (
            <div className="flex min-h-10 items-center justify-between gap-2 p-1 pl-3">
              <Badge variant="outline">
                {typeof selected.label === 'string'
                  ? selected.label
                  : selectedName}
              </Badge>
              {!disabled ? (
                <ConfirmRemoveButton
                  kind="block"
                  description="This clears the selected block and its fields so you can choose another block."
                  label="Reset block"
                  onConfirm={() => onChange(null)}
                />
              ) : null}
            </div>
          ) : null}
          <div
            className={
              headerInList
                ? undefined
                : embedded
                  ? 'border-t pt-4'
                  : 'border-t p-4'
            }
          >
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
        <div className={embedded ? 'space-y-3' : 'space-y-3 p-4'}>
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
  embedded = false,
  hideMetadata = false,
  blockHeaderInList = false,
  inheritedReadonly = false,
  onChange,
}: {
  field: JsonObject
  value: JsonValue | undefined
  referenceContext?: ReferenceContext
  embedded?: boolean
  hideMetadata?: boolean
  blockHeaderInList?: boolean
  inheritedReadonly?: boolean
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
      {(!hideMetadata &&
        (label || required || (disabled && !inheritedReadonly))) ||
      headerActions ? (
        <div
          className="flex min-h-6 items-center justify-between gap-2"
          data-slot="field-header"
        >
          <div className="flex min-w-0 items-center gap-2">
            {!hideMetadata && label ? (
              <FieldLabel htmlFor={controlId}>{label}</FieldLabel>
            ) : null}
            {!hideMetadata && required ? (
              <Badge variant="secondary" className="text-muted-foreground">
                <Asterisk className="-ml-1 -mr-0.5" />
                Required
              </Badge>
            ) : null}
            {!hideMetadata && disabled && !inheritedReadonly ? (
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
      {!hideMetadata && description ? (
        <FieldDescription>{description}</FieldDescription>
      ) : null}
    </Field>
  )

  let control: React.ReactNode
  if (field.list) {
    return (
      <ListFieldControl
        disabled={disabled}
        field={field}
        referenceContext={referenceContext}
        value={value}
        renderField={renderField}
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
      <ErrorAlert>
        Field component “{field.component}” is not installed.
      </ErrorAlert>
    )
  } else if (type === 'object') {
    control = (
      <ObjectFieldControl
        embedded={embedded}
        field={field}
        referenceContext={referenceContext}
        value={value}
        onChange={onChange}
      />
    )
  } else if (type === 'block') {
    control = (
      <BlockFieldControl
        embedded={embedded}
        headerInList={blockHeaderInList}
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
    const CustomField = customFieldEditors.get(type)
    if (CustomField)
      return renderField(
        <ClientOnly fallback={<DeferredEditorFallback />}>
          <Suspense fallback={<DeferredEditorFallback />}>
            <CustomField
              disabled={disabled}
              field={field}
              id={controlId}
              label={label ?? name}
              referenceContext={referenceContext}
              required={required}
              value={value}
              onChange={onChange}
              renderField={(node) => node}
            />
          </Suspense>
        </ClientOnly>,
      )
    const CoreField = coreFieldRendererRegistry.get(type)
    if (!CoreField)
      return renderField(<ErrorAlert>Unknown field type: {type}</ErrorAlert>)
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

export function keyedMediaValues(values: readonly string[]) {
  return values.map((path, index) => ({
    id: `${index}:${path}`,
    index,
    path,
  }))
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
  const canViewGitHub = useRepositoryGitHubLink()
  return (
    <div
      className="relative size-28"
      ref={sortable.setNodeRef}
      style={sortableItemStyle(
        sortable.transform,
        sortable.transition,
        sortable.isDragging,
      )}
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
          className="size-28 rounded-lg"
          name={mediaName}
          path={path}
        />
      </div>
      <div className="absolute right-1 bottom-1 flex rounded-md bg-background/95 p-0.5 shadow-sm backdrop-blur-sm">
        {canViewGitHub ? (
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
        ) : null}
        {!readonly ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  aria-label={`Remove ${path}`}
                  size="icon-xs"
                  type="button"
                  variant="ghost"
                  onClick={onRemove}
                >
                  <Trash2 className="text-muted-foreground" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Remove image</TooltipContent>
            </Tooltip>
          </TooltipProvider>
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
  const canViewGitHub = useRepositoryGitHubLink()
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
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  if (!media) {
    return <ErrorAlert>Media is not configured.</ErrorAlert>
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
  const selectedItems = keyedMediaValues(selected)
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
        rename: parseUploadRename(settings.rename),
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
              const oldIndex = selectedItems.findIndex(
                (item) => item.id === active.id,
              )
              const newIndex = selectedItems.findIndex(
                (item) => item.id === over.id,
              )
              if (oldIndex >= 0 && newIndex >= 0)
                onChange(arrayMove(selected, oldIndex, newIndex))
            }}
          >
            <SortableContext
              items={selectedItems.map((item) => item.id)}
              strategy={rectSortingStrategy}
            >
              <div className="flex flex-wrap gap-2">
                {selectedItems.map((item) => (
                  <ImageFieldThumbnail
                    context={context}
                    draggable={multiple}
                    id={item.id}
                    key={item.id}
                    mediaName={mediaName}
                    path={item.path}
                    readonly={disabled}
                    onRemove={() => {
                      const next = selected.filter(
                        (_selectedPath, index) => index !== item.index,
                      )
                      onChange(multiple ? next : undefined)
                    }}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        ) : (
          <DndContext
            id={`${dndId}-files`}
            collisionDetection={closestCenter}
            sensors={sensors}
            onDragEnd={({ active, over }) => {
              if (disabled || !multiple || !over || active.id === over.id)
                return
              const from = selectedItems.findIndex(
                (item) => item.id === active.id,
              )
              const to = selectedItems.findIndex((item) => item.id === over.id)
              if (from >= 0 && to >= 0) onChange(arrayMove(selected, from, to))
            }}
          >
            <SortableContext
              items={selectedItems.map((item) => item.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                {selectedItems.map((item) => (
                  <SortableListItem
                    key={item.id}
                    id={item.id}
                    disabled={disabled || !multiple}
                  >
                    {(handle) => (
                      <div className="flex min-h-10 items-center rounded-xl border bg-card p-1">
                        {multiple && !disabled ? handle : null}
                        {canViewGitHub ? (
                          <Button
                            asChild
                            aria-label={`Open ${item.path}`}
                            className="min-w-0 flex-1 justify-start text-sm"
                            size="sm"
                            variant="ghost"
                          >
                            <a
                              href={`https://github.com/${encodeURIComponent(context.owner)}/${encodeURIComponent(context.repo)}/blob/${encodeURIComponent(context.branch)}/${item.path.split('/').map(encodeURIComponent).join('/')}`}
                              rel="noreferrer"
                              target="_blank"
                            >
                              <MediaFileIcon path={item.path} />
                              <span className="truncate">
                                {relativeMediaPath(item.path, mediaInput)}
                              </span>
                              <ArrowUpRight
                                className="size-4 opacity-50"
                                data-icon="inline-end"
                              />
                            </a>
                          </Button>
                        ) : (
                          <span className="inline-flex h-7 min-w-0 flex-1 items-center gap-1 border border-transparent px-2.5 text-sm font-medium">
                            <MediaFileIcon path={item.path} />
                            <span className="truncate">
                              {relativeMediaPath(item.path, mediaInput)}
                            </span>
                          </span>
                        )}
                        {!disabled ? (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  aria-label={`Remove ${item.path}`}
                                  className="text-muted-foreground hover:text-foreground"
                                  size="icon-sm"
                                  type="button"
                                  variant="ghost"
                                  onClick={() => {
                                    const next = selected.filter(
                                      (_selectedPath, index) =>
                                        index !== item.index,
                                    )
                                    onChange(multiple ? next : undefined)
                                  }}
                                >
                                  <Trash2 />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Remove file</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : null}
                      </div>
                    )}
                  </SortableListItem>
                ))}
              </div>
            </SortableContext>
          </DndContext>
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
        initialPath={configuredStartPath}
        open={open}
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
          onChange(paths.slice(0, max))
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
    return <ErrorAlert>Reference collection is missing.</ErrorAlert>
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
