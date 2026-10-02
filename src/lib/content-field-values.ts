import { customFieldDefinition } from '#/fields/registry'
import { transformDateValue } from './date-field'
import type { JsonObject, JsonValue } from './json'
import { toJsonValue } from './json'
import { initializeStructuredContent } from './field-values'

function object(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function childFields(field: JsonObject, value: JsonValue | undefined) {
  if (field.type === 'object')
    return Array.isArray(field.fields) ? field.fields : []
  if (field.type !== 'block' || !object(value)) return []
  const key = typeof field.blockKey === 'string' ? field.blockKey : '_block'
  const block = Array.isArray(field.blocks)
    ? field.blocks.find((item) => object(item) && item.name === value[key])
    : undefined
  return object(block) && Array.isArray(block.fields) ? block.fields : []
}

export function transformContentFields(
  fields: unknown[],
  content: JsonObject | JsonValue[],
  direction: 'read' | 'write',
): JsonObject | JsonValue[] {
  if (Array.isArray(content))
    return content.map((item) =>
      object(item)
        ? (transformContentFields(fields, item, direction) as JsonObject)
        : item,
    )
  const result = { ...content }
  for (const field of fields) {
    if (!object(field) || typeof field.name !== 'string') continue
    if (
      direction === 'read' &&
      (!(field.name in result) || result[field.name] === null)
    ) {
      const initialized = initializeStructuredContent([field])
      if (field.name in initialized)
        result[field.name] = initialized[field.name]
      continue
    }
    const scalar = (value: JsonValue | undefined): JsonValue | undefined => {
      if (object(value) && (field.type === 'object' || field.type === 'block'))
        return transformContentFields(
          childFields(field, value),
          value,
          direction,
        )
      if (field.type === 'date')
        return transformDateValue(value, field, direction) as
          JsonValue | undefined
      const definition = customFieldDefinition(String(field.type))
      if (
        direction === 'write' &&
        definition?.schema &&
        value !== undefined &&
        value !== null &&
        value !== ''
      ) {
        const parsed = definition.schema(field).safeParse(value)
        if (!parsed.success)
          throw new Error(
            `${String(field.name)}: ${parsed.error?.issues[0]?.message ?? 'Invalid value'}`,
          )
        value = parsed.data === undefined ? undefined : toJsonValue(parsed.data)
      }
      const hook = definition?.[direction]
      return hook ? hook(value, field) : value
    }
    const value = result[field.name]
    const next =
      field.list && Array.isArray(value)
        ? value.map((item) => scalar(item) ?? null)
        : scalar(value)
    if (next === undefined) delete result[field.name]
    else result[field.name] = next
  }
  return result
}

/** Project managed fields before saving; retain only the selected block's shape. */
export function projectContentFields(
  fields: unknown[],
  content: JsonObject | JsonValue[],
): JsonObject | JsonValue[] {
  if (Array.isArray(content))
    return content.map((item) =>
      object(item) ? (projectContentFields(fields, item) as JsonObject) : item,
    )
  const result: JsonObject = {}
  for (const field of fields) {
    if (
      !object(field) ||
      typeof field.name !== 'string' ||
      !(field.name in content)
    )
      continue
    const scalar = (value: JsonValue): JsonValue => {
      if (!object(value) || !['object', 'block'].includes(String(field.type)))
        return value
      const projected = projectContentFields(
        childFields(field, value),
        value,
      ) as JsonObject
      if (field.type === 'block') {
        const key =
          typeof field.blockKey === 'string' ? field.blockKey : '_block'
        if (key in value) projected[key] = value[key]
      }
      return projected
    }
    const value = content[field.name]
    result[field.name] =
      field.list && Array.isArray(value) ? value.map(scalar) : scalar(value)
  }
  return result
}

/** Objects merge recursively; arrays replace, including empty arrays. */
export function mergeContent(
  existing: JsonObject,
  submitted: JsonObject,
): JsonObject {
  const result = { ...existing }
  for (const [key, value] of Object.entries(submitted)) {
    result[key] =
      object(value) && object(result[key])
        ? mergeContent(result[key], value)
        : value
  }
  return result
}
