import { useId } from 'react'
import { StructuredContentField } from '#/components/structured-content-field'
import { Field, FieldLabel } from '#/components/ui/field'
import { Textarea } from '#/components/ui/textarea'
import { isContentField } from '#/lib/content-field'
import type { JsonObject, JsonValue } from '#/lib/json'
import type { ReferenceContext } from '#/features/editor/fields/field-types'
import type { DraftConflict } from './merge-draft'

function inferredField(
  name: string,
  value: unknown,
  fields?: unknown,
): JsonObject {
  if (Array.isArray(value)) {
    const first = value.find((item) => item !== null)
    return { ...inferredField(name, first, fields), list: true }
  }
  if (isContentField(value)) {
    return {
      name,
      type: 'object',
      fields:
        Array.isArray(fields) && fields.length
          ? fields
          : Object.entries(value).map(([key, child]) =>
              inferredField(key, child),
            ),
    }
  }
  return {
    name,
    type:
      typeof value === 'boolean'
        ? 'boolean'
        : typeof value === 'number'
          ? 'number'
          : 'string',
  }
}

function previewField(field: JsonObject): JsonObject {
  const result: JsonObject = {
    ...field,
    readonly: true,
    required: false,
    hidden: false,
  }
  for (const key of ['fields', 'blocks'] as const) {
    if (Array.isArray(field[key]))
      result[key] = field[key].map((child) =>
        isContentField(child) ? previewField(child) : child,
      )
  }
  // Comparison must expose every item without edit, reorder or collapse actions.
  if (field.list)
    result.list = {
      ...(isContentField(field.list) ? field.list : {}),
      collapsible: false,
    }
  if (field.type === 'rich-text')
    result.options = {
      ...(isContentField(field.options) ? field.options : {}),
      switcher: false,
    }
  return result
}

export function DraftFieldPreview({
  value,
  field,
  fields,
  label,
  context,
}: {
  value: DraftConflict['mine']
  field?: JsonObject
  fields?: unknown
  label: string
  context?: ReferenceContext
}) {
  const id = useId()
  if (!value.exists || value.value === null)
    return (
      <Field>
        <FieldLabel>{label}</FieldLabel>
        <p className="text-sm italic text-muted-foreground">
          {value.exists ? 'Empty' : 'Removed'}
        </p>
      </Field>
    )
  const definition = field ?? inferredField(label, value.value, fields)
  if (
    typeof value.value === 'string' &&
    (!field ||
      field.type === 'code' ||
      (value.value.includes('\n') && field.type !== 'rich-text') ||
      (value.value.length > 100 && field.type === 'string'))
  ) {
    return (
      <Field>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <Textarea
          id={id}
          readOnly
          tabIndex={-1}
          value={value.value}
          className={`min-h-10 resize-none field-sizing-content ${!field || field.type === 'code' ? 'font-mono' : ''}`}
        />
      </Field>
    )
  }
  return (
    <div className="pointer-events-none min-w-0 [&_input]:bg-transparent! [&_textarea]:bg-transparent! dark:[&_input]:bg-input/30! dark:[&_textarea]:bg-input/30! [&_input]:text-foreground! [&_textarea]:text-foreground! [&_input]:opacity-100! [&_textarea]:opacity-100! [&_[data-slot=select-trigger]]:opacity-100! [&_[data-slot=switch]]:opacity-100! [&_[data-slot=field-header]_[data-slot=badge]]:hidden">
      <StructuredContentField
        embedded
        inheritedReadonly
        field={previewField({ ...definition, label })}
        referenceContext={context}
        value={value.value as JsonValue}
        onChange={() => {}}
      />
    </div>
  )
}
