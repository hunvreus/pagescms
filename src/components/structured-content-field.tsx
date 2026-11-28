import { deferredComponent } from '#/lib/deferred-component'
import {
  Trans as UiTrans,
  useLingui as useUiMessages,
} from '@lingui/react/macro'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  loadRichTextField,
  loadCodeField,
} from '#/features/editor/editor-component-loaders'
import { LocaleContext } from '#/features/editor/locale-context'
import { FieldLocaleMenu } from '#/features/editor/field-locale-menu'
import {
  fieldLocaleValues,
  copyFieldLocale,
  canCopyFieldLocale,
  relativeLocaleFieldPath,
} from '#/features/editor/field-locale-values'
import { Spinner } from '#/components/ui/spinner'
import { useQueryClient } from '@tanstack/react-query'
import { authenticationQueryOptions } from '#/client/queries/session'
import {
  createContext,
  lazy,
  Suspense,
  useContext,
  useEffect,
  useId,
  memo,
  useMemo,
  useRef,
  useState,
} from 'react'
import { isContentField } from '#/lib/content-field'
import type { CSSProperties } from 'react'
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
import ArrowUpRight from '@hugeicons/core-free-icons/ArrowUpRight01Icon'
import Asterisk from '@hugeicons/core-free-icons/Asterisk02Icon'
import Ban from '@hugeicons/core-free-icons/BanIcon'
import ChevronRight from '@hugeicons/core-free-icons/ChevronRightIcon'
import ChevronsDownUp from '@hugeicons/core-free-icons/ChevronsDownUpIcon'
import ChevronsUpDown from '@hugeicons/core-free-icons/UnfoldMoreIcon'
import Folder from '@hugeicons/core-free-icons/Folder01Icon'
import GripVertical from '@hugeicons/core-free-icons/GripVerticalIcon'
import Plus from '@hugeicons/core-free-icons/PlusIcon'
import Trash2 from '@hugeicons/core-free-icons/Delete02Icon'
import Upload from '@hugeicons/core-free-icons/Upload01Icon'
import X from '@hugeicons/core-free-icons/XIcon'

import { Button } from '#/components/ui/button'
import { EditorSkeleton } from '#/components/editor-skeleton'
import { useMediaGitHubLink } from '#/hooks/use-media-github-link'
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
import { MediaFileIcon } from '#/components/media-file-icon'
import { LoadError } from '#/components/operation-error'
import { ErrorAlert } from '#/components/error-alert'
import {
  Field,
  FieldDescription,
  FieldLabel,
  FieldError,
} from '#/components/ui/field'
import { OptionCombobox } from '#/components/option-combobox'
import { ToggleGroup, ToggleGroupItem } from '#/components/ui/toggle-group'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '#/components/ui/tooltip'
import { MediaPickerDialog } from '#/features/media/media-picker-dialog'
import {
  MediaUploadError,
  uploadMediaFiles,
} from '#/features/media/media-upload'
import { useFieldIssues } from '#/features/editor/fields/field-validation'
import {
  multipleFieldLimits,
  normalizeFieldValue,
  referenceOption,
} from '#/lib/field-value-shapes'
import { coreFieldRendererRegistry } from '#/features/editor/fields/core-field-renderers'
import {
  getListFieldOptions,
  getListItemSummary,
} from '#/features/editor/fields/structured-field-options'
import { useReferenceOptions } from '#/features/editor/fields/use-reference-options'
import { initializeStructuredContent } from '#/lib/field-values'
import { customFieldDefinition } from '#/fields/registry'
import { parseUploadRename } from '#/lib/media-upload-name'
import { customFieldEditors } from '#/features/editor/fields/custom-field-components'
import {
  allowedMediaFieldExtensions,
  relativeMediaPath,
  resolveFieldMedia,
} from '#/lib/media-field-values'

import type { JsonObject, JsonValue } from '#/shared/json'
import type { FieldRendererProps } from '#/features/editor/fields/field-renderer-registry'
import type { ReferenceContext } from '#/features/editor/fields/field-types'

const RichTextField = deferredComponent(loadRichTextField, () => (
  <EditorSkeleton className="rounded-lg" />
))
const CodeField = lazy(loadCodeField)
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
  const { t: _t } = useUiMessages()

  const [mode, setMode] = useState<'editor' | 'source'>('editor')
  const [pendingUploads, setPendingUploads] = useState(0)
  const settings = isContentField(field.options) ? field.options : {}
  const headerActions =
    settings.switcher === false ? undefined : (
      <ToggleGroup
        aria-label={_t({ message: `${label} mode` })}
        className="gap-0"
        spacing={1}
        type="single"
        value={mode}
        onValueChange={(next) => {
          if (next === 'editor' || next === 'source') setMode(next)
        }}
      >
        {(['editor', 'source'] as const).map((nextMode) => (
          <ToggleGroupItem
            className="h-6 min-w-0 rounded-md px-2 text-xs text-muted-foreground hover:text-foreground data-[state=on]:text-foreground"
            disabled={disabled || pendingUploads > 0}
            key={nextMode}
            value={nextMode}
          >
            {nextMode === 'editor'
              ? _t({ message: 'Editor' })
              : _t({ message: 'Source' })}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    )

  return renderField(
    <Suspense fallback={<EditorSkeleton className="rounded-lg" />}>
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
    </Suspense>,
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
    <Suspense fallback={<EditorSkeleton className="rounded-lg" />}>
      <CodeField
        disabled={disabled}
        field={field}
        id={id}
        label={label}
        required={required}
        value={value}
        onChange={onChange}
      />
    </Suspense>,
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
  if (customFieldDefinition(String(field.type ?? field.component))) return ''
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
  const { t: _t } = useUiMessages()

  const Icon = kind === 'block' ? X : Trash2
  const tooltip =
    kind === 'block'
      ? _t({ message: 'Reset block' })
      : _t({ message: 'Remove item' })
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
        <HugeiconsIcon aria-hidden="true" icon={Icon} />
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
                <HugeiconsIcon aria-hidden="true" icon={Icon} />
              </Button>
            </AlertDialogTrigger>
          </TooltipTrigger>
          <TooltipContent>{tooltip}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {kind === 'block'
              ? _t({ message: 'Reset this block?' })
              : _t({ message: 'Remove this item?' })}
          </AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>
            <UiTrans>Cancel</UiTrans>
          </AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            {kind === 'block'
              ? _t({ message: 'Reset' })
              : _t({ message: 'Remove' })}
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

const SortableHandleContext = createContext<Pick<
  ReturnType<typeof useSortable>,
  'attributes' | 'listeners'
> | null>(null)

function SortableListHandle() {
  const { t: _t } = useUiMessages()

  const sortable = useContext(SortableHandleContext)
  return (
    <Button
      aria-label={_t({ message: 'Reorder item' })}
      className="cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
      size="icon-sm"
      type="button"
      variant="ghost"
      {...sortable?.attributes}
      {...sortable?.listeners}
    >
      <HugeiconsIcon aria-hidden="true" icon={GripVertical} />
    </Button>
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
  // Drag context updates the wrapper and handle, without rebuilding nested editors.
  const content = useMemo(
    () => children(disabled ? null : <SortableListHandle />),
    [children, disabled],
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
      <SortableHandleContext.Provider value={sortable}>
        {content}
      </SortableHandleContext.Provider>
    </div>
  )
}

function ListFieldControl({
  path,
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
  path: string
}) {
  const { t: _t } = useUiMessages()

  const validation = useFieldIssues(path)
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
    copy[index] = next ?? null
    onChange(copy)
  }

  function remove(index: number) {
    validation.clear(path)
    onChange(values.filter((_, itemIndex) => itemIndex !== index))
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
    validation.clear(path)
    onChange(arrayMove(values, from, to))
    setItemIds((current) => arrayMove(current, from, to))
    setOpenItems((current) => arrayMove(current, from, to))
  }

  useEffect(() => {
    setOpenItems((current) => {
      const next = current.map(
        (open, index) =>
          open ||
          validation.issues.some(
            (issue) =>
              issue.path === `${path}.${index}` ||
              issue.path.startsWith(`${path}.${index}.`),
          ),
      )
      return next.some((open, index) => open !== current[index])
        ? next
        : current
    })
  }, [validation.issues, path])

  const headerActions =
    options.collapsible && values.length > 1 ? (
      <Button
        className="text-muted-foreground hover:text-foreground"
        size="xs"
        type="button"
        variant="ghost"
        onClick={() =>
          setOpenItems((current) =>
            current.map(() => current.some((open) => !open)),
          )
        }
      >
        {openItems.every(Boolean) ? (
          <HugeiconsIcon
            aria-hidden="true"
            icon={ChevronsDownUp}
            data-icon="inline-start"
          />
        ) : (
          <HugeiconsIcon
            aria-hidden="true"
            icon={ChevronsUpDown}
            data-icon="inline-start"
          />
        )}
        {openItems.every(Boolean)
          ? _t({ message: 'Collapse all' })
          : _t({ message: 'Expand all' })}
      </Button>
    ) : undefined

  return renderField(
    <div className="space-y-2">
      {values.length ? (
        <DndContext
          collisionDetection={closestCenter}
          id={`${listId}-dnd`}
          sensors={sensors}
          onDragEnd={({ active, over }) => {
            if (over) reorder(String(active.id), String(over.id))
          }}
        >
          <SortableContext
            items={itemIds}
            strategy={verticalListSortingStrategy}
          >
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
                                <HugeiconsIcon
                                  aria-hidden="true"
                                  icon={ChevronRight}
                                  className="text-muted-foreground transition-transform group-data-[state=open]/button:rotate-90"
                                  data-icon="inline-start"
                                />
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
                                    description={_t({
                                      message:
                                        'This clears the selected block and its fields, keeping the list item so you can choose another block.',
                                    })}
                                    label={_t({
                                      message: `Reset block in item ${index + 1}`,
                                    })}
                                    onConfirm={() => update(index, null)}
                                  />
                                ) : null}
                              </>
                            ) : null}
                            {!disabled ? (
                              <ConfirmRemoveButton
                                description={_t({
                                  message:
                                    'This removes the item and all of its nested fields.',
                                })}
                                disabled={values.length <= options.min}
                                label={_t({
                                  message: `Remove item ${index + 1}`,
                                })}
                                onConfirm={() => remove(index)}
                              />
                            ) : null}
                          </div>
                          <MountedGroupContent
                            open={
                              openItems[index] ?? !options.initiallyCollapsed
                            }
                          >
                            <div className="border-t p-4">
                              <StructuredContentField
                                embedded
                                hideMetadata
                                blockHeaderInList
                                path={`${path}.${index}`}
                                field={itemField}
                                inheritedReadonly={disabled}
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
                              path={`${path}.${index}`}
                              field={itemField}
                              inheritedReadonly={disabled}
                              referenceContext={referenceContext}
                              value={item}
                              onChange={(next) => update(index, next)}
                            />
                          </div>
                          {!disabled ? (
                            <ConfirmRemoveButton
                              description={_t({
                                message: 'This removes the item from the list.',
                              })}
                              disabled={values.length <= options.min}
                              label={_t({
                                message: `Remove item ${index + 1}`,
                              })}
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
      ) : null}
      {!values.length ? (
        <p className="text-sm text-muted-foreground">
          <UiTrans>No items.</UiTrans>
        </p>
      ) : null}
      {!disabled && values.length < options.max ? (
        <Button
          size="sm"
          type="button"
          variant="outline"
          onClick={() => {
            validation.clear(path)
            onChange([...values, initialFieldValue(field)])
          }}
        >
          <HugeiconsIcon
            aria-hidden="true"
            icon={Plus}
            data-icon="inline-start"
          />{' '}
          <UiTrans>Add item</UiTrans>
        </Button>
      ) : null}
    </div>,
    headerActions,
  )
}

function ObjectFieldControl({
  path,
  disabled = false,
  field,
  value,
  referenceContext,
  embedded = false,
  onChange,
}: {
  path: string
  disabled?: boolean
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
            path={`${path}.${name}`}
            inheritedReadonly={
              disabled || (field.readonly === true && child.readonly !== true)
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
  path,
  field,
  value,
  disabled,
  referenceContext,
  embedded = false,
  headerInList = false,
  onChange,
}: {
  path: string
  field: JsonObject
  value: JsonValue | undefined
  disabled: boolean
  referenceContext?: ReferenceContext
  embedded?: boolean
  headerInList?: boolean
  onChange: (value: JsonValue) => void
}) {
  const { t: _t } = useUiMessages()

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
                  description={_t({
                    message:
                      'This clears the selected block and its fields so you can choose another block.',
                  })}
                  label={_t({ message: 'Reset block' })}
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
              path={path}
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
          <p className="text-sm font-medium">
            <UiTrans>Choose a content block</UiTrans>
          </p>
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

export const StructuredContentField = memo(function StructuredContentField(
  props: React.ComponentProps<typeof ContentFieldControl>,
) {
  const context = useContext(LocaleContext)
  if (context && props.field.localized === true) {
    if (props.value !== undefined && !isContentField(props.value))
      return (
        <Field data-invalid>
          <FieldLabel>
            {String(props.field.label ?? props.field.name)}
          </FieldLabel>
          <FieldError>
            <UiTrans>
              This value must be an object keyed by language. Its existing value
              has been retained.
            </UiTrans>
          </FieldError>
          <pre className="overflow-auto text-xs">
            {JSON.stringify(props.value, null, 2)}
          </pre>
          {!props.inheritedReadonly && !props.field.readonly ? (
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                props.onChange({
                  [context.defaultLocale ?? context.locales[0].code]:
                    props.value ?? null,
                })
              }
            >
              <UiTrans>Convert to translations</UiTrans>
            </Button>
          ) : null}
        </Field>
      )
    const map = isContentField(props.value) ? props.value : {}
    const field = { ...props.field, localized: false }
    return (
      <LocaleContext.Provider
        value={{
          ...context,
          inherited: true,
          boundary: {
            path: `${props.path ?? props.field.name}.${context.locale}`,
            value: map,
            onChange: props.onChange,
          },
        }}
      >
        <ContentFieldControl
          key={context.locale}
          {...props}
          field={field}
          value={map[context.locale]}
          path={`${props.path ?? props.field.name}.${context.locale}`}
          onChange={(value) => {
            if (value === undefined && !Object.hasOwn(map, context.locale))
              return
            const next = { ...map }
            next[context.locale] = value ?? null
            props.onChange(next)
          }}
        />
      </LocaleContext.Provider>
    )
  }
  return <ContentFieldControl {...props} />
})

function ContentFieldControl({
  path: fieldPath,
  field,
  value,
  referenceContext,
  embedded = false,
  hideMetadata = false,
  blockHeaderInList = false,
  inheritedReadonly = false,
  onChange: onValueChange,
}: {
  path?: string
  field: JsonObject
  value: JsonValue | undefined
  referenceContext?: ReferenceContext
  embedded?: boolean
  hideMetadata?: boolean
  blockHeaderInList?: boolean
  inheritedReadonly?: boolean
  onChange: (value: JsonValue | undefined) => void
}) {
  const localeContext = useContext(LocaleContext)
  const name = String(field.name)
  const path = fieldPath ?? name
  const validation = useFieldIssues(
    path,
    !field.list && field.type !== 'object' && field.type !== 'block',
  )
  const onChange = (next: JsonValue | undefined) => {
    if (!field.list && field.type !== 'object' && field.type !== 'block')
      validation.clear(path)
    if (!field.list && field.type === 'block') {
      const key = typeof field.blockKey === 'string' ? field.blockKey : '_block'
      if (
        !isContentField(next) ||
        !isContentField(value) ||
        next[key] !== value[key]
      )
        validation.clear(path)
    }
    onValueChange(next)
  }
  const type = typeof field.type === 'string' ? field.type : 'string'
  const label =
    field.label === false
      ? null
      : typeof field.label === 'string'
        ? field.label
        : name
  const disabled = inheritedReadonly || field.readonly === true
  const required = field.required === true
  const description =
    typeof field.description === 'string' ? field.description : null
  const controlId = useId()
  const boundary = localeContext?.boundary
  const localePath = boundary
    ? relativeLocaleFieldPath(boundary.path, path)
    : undefined
  const localeValues =
    boundary && localePath ? fieldLocaleValues(boundary.value, localePath) : {}
  const localeBadge = localeContext?.inherited ? (
    <FieldLocaleMenu
      locale={localeContext.locale}
      locales={localeContext.locales}
      label={label ?? name}
      value={localeValues}
      onSelect={localeContext.onSelect}
      onCopy={
        !disabled &&
        boundary &&
        localePath &&
        canCopyFieldLocale(boundary.value, localeContext.locale, localePath)
          ? (code) =>
              boundary.onChange(
                copyFieldLocale(
                  boundary.value,
                  code,
                  localeContext.locale,
                  localePath,
                ),
              )
          : undefined
      }
    />
  ) : null

  if (field.hidden === true) return null

  const renderField = (
    fieldControl: React.ReactNode,
    headerActions?: React.ReactNode,
  ) => (
    <Field
      data-field-leaf={!field.list && type !== 'object' && type !== 'block'}
      data-field-path={path}
      data-invalid={validation.hasErrors || undefined}
      aria-invalid={validation.hasErrors || undefined}
      aria-describedby={
        validation.messages.length ? `${controlId}-error` : undefined
      }
      tabIndex={-1}
    >
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
            {!hideMetadata ? localeBadge : null}
            {!hideMetadata && required ? (
              <Badge
                variant="secondary"
                className="bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-400/15 dark:text-fuchsia-300"
              >
                <HugeiconsIcon
                  aria-hidden="true"
                  icon={Asterisk}
                  data-icon="inline-start"
                />
                <UiTrans>Required</UiTrans>
              </Badge>
            ) : null}
            {!hideMetadata && disabled && !inheritedReadonly ? (
              <Badge variant="secondary" className="text-muted-foreground">
                <HugeiconsIcon
                  aria-hidden="true"
                  icon={Ban}
                  data-icon="inline-start"
                />
                <UiTrans>Readonly</UiTrans>
              </Badge>
            ) : null}
          </div>
          {headerActions ? (
            <div
              className="flex shrink-0 items-center gap-1"
              data-slot="field-header-actions"
            >
              {headerActions}
            </div>
          ) : null}
        </div>
      ) : null}
      {fieldControl}
      <FieldError id={`${controlId}-error`} errors={validation.messages} />
      {!hideMetadata && description ? (
        <FieldDescription>{description}</FieldDescription>
      ) : null}
    </Field>
  )

  const customType =
    typeof field.component === 'string' ? field.component : type
  const CustomField = customFieldEditors.get(customType)
  let control: React.ReactNode
  if (field.list) {
    return (
      <ListFieldControl
        path={path}
        disabled={disabled}
        field={field}
        referenceContext={referenceContext}
        value={value}
        renderField={renderField}
        onChange={onChange}
      />
    )
  } else if (typeof field.component === 'string' && !CustomField) {
    control = (
      <ErrorAlert>
        <UiTrans>Field component “</UiTrans>
        {field.component}
        <UiTrans>” is not installed.</UiTrans>
      </ErrorAlert>
    )
  } else if (CustomField) {
    return renderField(
      <Suspense fallback={<EditorSkeleton className="min-h-48" />}>
        <CustomField
          invalid={validation.hasErrors}
          errorId={
            validation.messages.length ? `${controlId}-error` : undefined
          }
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
      </Suspense>,
    )
  } else if (type === 'object') {
    control = (
      <ObjectFieldControl
        path={path}
        disabled={disabled && field.readonly !== true}
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
        path={path}
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
        invalid={validation.hasErrors}
        errorId={validation.messages.length ? `${controlId}-error` : undefined}
        id={controlId}
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
  } else if (type === 'image' || type === 'file') {
    return renderField(
      <ErrorAlert>
        <UiTrans>
          Media is not configured for this field. Configure a media library to
          select or upload files.
        </UiTrans>
      </ErrorAlert>,
    )
  } else {
    const CoreField = coreFieldRendererRegistry.get(type)
    if (!CoreField)
      return renderField(
        <ErrorAlert>
          <UiTrans>Unknown field type: {type}</UiTrans>
        </ErrorAlert>,
      )
    return (
      <CoreField
        invalid={validation.hasErrors}
        errorId={validation.messages.length ? `${controlId}-error` : undefined}
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
  canViewGitHub,
  draggable,
  id,
  mediaName,
  path,
  readonly,
  onRemove,
}: {
  context: ReferenceContext
  canViewGitHub: boolean
  draggable: boolean
  id: string
  mediaName: string
  path: string
  readonly: boolean
  onRemove: () => void
}) {
  const { t: _t, i18n: previewI18n } = useUiMessages()

  const sortable = useSortable({ id, disabled: readonly || !draggable })
  const content = useMemo(
    () => ({
      thumbnail: (
        <MediaThumbnail
          owner={context.owner}
          repo={context.repo}
          repoId={context.repoId}
          repositorySource={context.source}
          branch={context.branch}
          className="size-28 rounded-lg"
          name={mediaName}
          path={path}
        />
      ),
      actions: (
        <div className="absolute right-1 bottom-1 flex rounded-md bg-background/95 p-0.5 shadow-sm backdrop-blur-sm">
          {canViewGitHub ? (
            <Button
              asChild
              aria-label={_t({ message: `View ${path} on GitHub` })}
              size="icon-xs"
              variant="ghost"
            >
              <a
                href={`https://github.com/${encodeURIComponent(context.owner)}/${encodeURIComponent(context.repo)}/blob/${encodeURIComponent(context.branch)}/${path.split('/').map(encodeURIComponent).join('/')}`}
                rel="noreferrer"
                target="_blank"
              >
                <HugeiconsIcon
                  aria-hidden="true"
                  icon={ArrowUpRight}
                  className="text-muted-foreground"
                />
              </a>
            </Button>
          ) : null}
          {!readonly ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    aria-label={_t({ message: `Remove ${path}` })}
                    size="icon-xs"
                    type="button"
                    variant="ghost"
                    onClick={onRemove}
                  >
                    <HugeiconsIcon
                      aria-hidden="true"
                      icon={Trash2}
                      className="text-muted-foreground"
                    />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <UiTrans>Remove image</UiTrans>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : null}
        </div>
      ),
    }),
    [context, mediaName, path, canViewGitHub, readonly, onRemove, previewI18n],
  )
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
        {content.thumbnail}
      </div>
      {content.actions}
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
  const { t: _t } = useUiMessages()

  const queryClient = useQueryClient()
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const settings = isContentField(field.options) ? field.options : {}
  const media = resolveFieldMedia(field, context.media ?? [])
  const canViewGitHub = useMediaGitHubLink(context, media)
  const multiple =
    settings.multiple === true || isContentField(settings.multiple)
  const max = multiple
    ? (multipleFieldLimits(field).max ?? Number.POSITIVE_INFINITY)
    : 1
  const selected = mediaValues(value, multiple)
  const current = useRef({ selected, onChange })
  current.current = { selected, onChange }
  const [open, setOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const uploadLock = useRef(false)
  const dndId = useId()
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  if (!media) {
    return (
      <ErrorAlert>
        <UiTrans>Media is not configured.</UiTrans>
      </ErrorAlert>
    )
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
    if (disabled || uploadLock.current || !files?.length) return
    const account = queryClient.getQueryData(
      authenticationQueryOptions().queryKey,
    )?.user?.id
    if (!account) return
    const isActive = () =>
      queryClient.getQueryData(authenticationQueryOptions().queryKey)?.user
        ?.id === account
    uploadLock.current = true
    setUploading(true)
    try {
      const uploaded = await uploadMediaFiles({
        isActive,
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
      if (!mounted.current || !isActive()) return
      if (multiple)
        current.current.onChange(
          (settings.unique === true
            ? [...new Set([...current.current.selected, ...uploaded])]
            : [...current.current.selected, ...uploaded]
          ).slice(0, max),
        )
      else if (uploaded[0]) current.current.onChange(uploaded[0])
    } catch (cause) {
      if (!mounted.current || !isActive()) return
      if (cause instanceof MediaUploadError && cause.paths.length) {
        if (multiple)
          current.current.onChange(
            (settings.unique === true
              ? [...new Set([...current.current.selected, ...cause.paths])]
              : [...current.current.selected, ...cause.paths]
            ).slice(0, max),
          )
        else current.current.onChange(cause.paths[0])
      }
    } finally {
      uploadLock.current = false
      setUploading(false)
    }
  }

  return (
    <div
      className="space-y-2"
      onDragOver={(event) => {
        if (!disabled && selected.length < max) event.preventDefault()
      }}
      onDrop={(event) => {
        if (disabled || selected.length >= max) return
        event.preventDefault()
        void upload(event.dataTransfer.files)
      }}
    >
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
                    canViewGitHub={canViewGitHub}
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
                            aria-label={_t({ message: `Open ${item.path}` })}
                            className="min-w-0 flex-1 justify-start text-sm"
                            size="sm"
                            variant="ghost"
                          >
                            <a
                              href={`https://github.com/${encodeURIComponent(context.owner)}/${encodeURIComponent(context.repo)}/blob/${encodeURIComponent(context.branch)}/${item.path.split('/').map(encodeURIComponent).join('/')}`}
                              rel="noreferrer"
                              target="_blank"
                            >
                              <MediaFileIcon
                                path={item.path}
                                data-icon="inline-start"
                              />
                              <span className="truncate">
                                {relativeMediaPath(item.path, mediaInput)}
                              </span>
                              <HugeiconsIcon
                                aria-hidden="true"
                                icon={ArrowUpRight}
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
                                  aria-label={_t({
                                    message: `Remove ${item.path}`,
                                  })}
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
                                  <HugeiconsIcon
                                    aria-hidden="true"
                                    icon={Trash2}
                                  />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <UiTrans>Remove file</UiTrans>
                              </TooltipContent>
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
        <p className="text-sm text-muted-foreground">
          <UiTrans>No file selected.</UiTrans>
        </p>
      )}
      {!disabled && selected.length < max ? (
        <div className="flex gap-2">
          <Button
            size="sm"
            type="button"
            variant="outline"
            onClick={() => setOpen(true)}
          >
            <HugeiconsIcon
              aria-hidden="true"
              icon={Folder}
              data-icon="inline-start"
            />{' '}
            <UiTrans>Select</UiTrans>
          </Button>
          <Button size="sm" aria-busy={uploading} asChild variant="outline">
            <label>
              <HugeiconsIcon
                aria-hidden="true"
                icon={Upload}
                data-icon="inline-start"
              />
              <UiTrans>Upload</UiTrans>
              {uploading ? (
                <Spinner aria-hidden="true" data-icon="inline-end" />
              ) : null}
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
        title={
          image
            ? _t({ message: 'Choose images' })
            : _t({ message: 'Choose files' })
        }
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
  const normalized = normalizeFieldValue(
    { type: 'reference', options: { multiple } },
    value,
  )
  return (Array.isArray(normalized) ? normalized : [normalized]).flatMap(
    (item) => {
      const option = referenceOption(item)
      return option ? [option.value] : []
    },
  )
}

function ReferenceFieldControl({
  invalid,
  errorId,
  id,
  context,
  field,
  value,
  disabled,
  onChange,
}: {
  invalid?: boolean
  errorId?: string
  id: string
  context: ReferenceContext
  field: JsonObject
  value: JsonValue | undefined
  disabled: boolean
  onChange: (value: JsonValue | undefined) => void
}) {
  const { t: _t } = useUiMessages()

  const settings = isContentField(field.options) ? field.options : {}
  const collection =
    typeof settings.collection === 'string' ? settings.collection : ''
  const multiple = Boolean(settings.multiple)
  const limits = multipleFieldLimits(field)
  const min = typeof limits.min === 'number' ? limits.min : 0
  const max =
    typeof limits.max === 'number' ? limits.max : Number.POSITIVE_INFINITY
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
  const references = useReferenceOptions({
    ...context,
    collection,
    valueTemplate,
    labelTemplate,
    searchFields,
    selectedValues,
  })

  const fallbacks = (Array.isArray(value) ? value : [value]).flatMap((item) => {
    const option = referenceOption(item)
    return option ? [option] : []
  })
  const merged = new Map(
    [...fallbacks, ...references.options].map((option) => [
      option.value,
      option,
    ]),
  )

  if (!collection) {
    return (
      <ErrorAlert>
        <UiTrans>Reference collection is missing.</UiTrans>
      </ErrorAlert>
    )
  }
  return (
    <div className="space-y-2">
      <OptionCombobox
        invalid={invalid}
        errorId={errorId}
        id={id}
        label={String(field.label ?? field.name)}
        disabled={disabled}
        readOnly={field.readonly === true}
        multiple={multiple}
        min={min}
        max={max}
        required={field.required === true}
        values={selectedValues}
        options={[...merged.values()]}
        loading={references.loading}
        onLoadMore={references.onLoadMore}
        placeholder={
          typeof settings.placeholder === 'string'
            ? settings.placeholder
            : _t({ message: 'Search references…' })
        }
        onSearch={references.onSearch}
        onChange={(next) => onChange(multiple ? next : next[0])}
      />
      <LoadError
        error={references.error}
        inline
        message={_t({ message: 'Could not load references.' })}
        onRetry={references.retry}
        retrying={references.loading}
      />
    </div>
  )
}
