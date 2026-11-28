import { customFieldDefinition } from '#/fields/registry'
import { transformDateValue } from './date-field'
import type { JsonObject, JsonValue } from '#/shared/json'
import { freezeJson, toJsonValue } from '#/shared/json'
import { initializeStructuredContent } from './field-values'
import { normalizeFieldValue } from './field-value-shapes'

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
  settings: {
    initializeMissing?: boolean
    configuration?: JsonObject
    customOnly?: boolean
  } = {},
): JsonObject | JsonValue[] {
  if (Array.isArray(content))
    return content.map((item) =>
      object(item)
        ? (transformContentFields(
            fields,
            item,
            direction,
            settings,
          ) as JsonObject)
        : item,
    )
  const result = { ...content }
  for (const field of fields) {
    if (!object(field) || typeof field.name !== 'string') continue
    if (
      direction === 'read' &&
      settings.initializeMissing !== false &&
      (!(field.name in result) || result[field.name] === null)
    ) {
      const initialized = initializeStructuredContent([field])
      if (field.name in initialized)
        result[field.name] = initialized[field.name]
      continue
    }
    const scalar = (value: JsonValue | undefined): JsonValue | undefined => {
      const definition = customFieldDefinition(
        String(field.type ?? field.component),
      )
      if (
        !definition &&
        object(value) &&
        (field.type === 'object' || field.type === 'block')
      )
        return transformContentFields(
          childFields(field, value),
          value,
          direction,
          settings,
        )
      if (!definition && settings.customOnly) return value
      if (!definition && field.type === 'date')
        return transformDateValue(value, field, direction) as
          JsonValue | undefined
      // Keep saved labels available until a reference resolves; writes stay scalar.
      if (
        !definition &&
        (direction === 'write' ||
          !['reference', 'select'].includes(String(field.type)))
      )
        value = normalizeFieldValue(field, value)
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
      return hook
        ? hook(
            value,
            field,
            settings.configuration && freezeJson(settings.configuration),
          )
        : value
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
      if (
        customFieldDefinition(String(field.type ?? field.component)) ||
        !object(value) ||
        !['object', 'block'].includes(String(field.type))
      )
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
