import type { JsonObject, JsonValue } from '#/shared/json'

export function referenceOption(value: JsonValue | undefined) {
  const item =
    typeof value === 'object' && value !== null && !Array.isArray(value)
      ? value.value
      : value
  if (
    typeof item !== 'string' &&
    typeof item !== 'number' &&
    typeof item !== 'boolean'
  )
    return
  const key = String(item)
  if (!key) return
  const label =
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    typeof value.label === 'string'
      ? value.label
      : key
  return { value: key, label }
}

/** Normalize compatible saved shapes; never discard an unrecognized value. */
export function normalizeFieldValue(
  field: Record<string, unknown>,
  value: JsonValue | undefined,
): JsonValue | undefined {
  const options =
    typeof field.options === 'object' &&
    field.options !== null &&
    !Array.isArray(field.options)
      ? (field.options as JsonObject)
      : {}
  if (field.type === 'reference' || field.type === 'select') {
    const normalize = (item: JsonValue) => referenceOption(item)?.value ?? item
    if (options.multiple) {
      if (value === undefined || value === null || value === '') return []
      return (Array.isArray(value) ? value : [value]).map(normalize)
    }
    return value === undefined ? value : normalize(value)
  }
  if (
    (field.type === 'image' || field.type === 'file') &&
    options.multiple &&
    typeof value === 'string'
  ) {
    return value ? [value] : []
  }
  if (
    field.type === 'number' &&
    typeof value === 'string' &&
    /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())
  ) {
    const number = Number(value)
    if (Number.isFinite(number)) return number
  }
  if (field.type === 'boolean') {
    if (value === 'true' || value === 1) return true
    if (value === 'false' || value === 0) return false
  }
  return value
}

export function multipleFieldLimits(field: Record<string, unknown>) {
  const options =
    typeof field.options === 'object' &&
    field.options !== null &&
    !Array.isArray(field.options)
      ? (field.options as JsonObject)
      : {}
  const multiple =
    typeof options.multiple === 'object' &&
    options.multiple !== null &&
    !Array.isArray(options.multiple)
      ? options.multiple
      : {}
  return {
    min:
      typeof multiple.min === 'number'
        ? multiple.min
        : typeof options.min === 'number'
          ? options.min
          : undefined,
    max:
      typeof multiple.max === 'number'
        ? multiple.max
        : typeof options.max === 'number'
          ? options.max
          : undefined,
  }
}
