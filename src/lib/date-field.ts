import { format, isValid, parse } from 'date-fns'

function settings(field: Record<string, unknown>) {
  return (field.options ?? {}) as Record<string, unknown>
}

export function dateInputFormat(field: Record<string, unknown>) {
  return settings(field).time ? "yyyy-MM-dd'T'HH:mm" : 'yyyy-MM-dd'
}

export function defaultDateValue(
  field: Record<string, unknown>,
  now = new Date(),
) {
  return format(now, dateInputFormat(field))
}

export function parseFieldDate(
  value: string,
  field: Record<string, unknown>,
  stored = false,
) {
  const options = settings(field)
  const pattern =
    stored && typeof options.format === 'string'
      ? options.format
      : dateInputFormat(field)
  try {
    const date = parse(value, pattern, new Date(2000, 0, 1))
    return isValid(date) ? date : undefined
  } catch {
    return undefined
  }
}

export function transformDateValue(
  value: unknown,
  field: Record<string, unknown>,
  direction: 'read' | 'write',
) {
  if (typeof value !== 'string' || !value) return value
  const date = parseFieldDate(value, field, direction === 'read')
  if (!date)
    throw new Error(`${String(field.name)} has an invalid date or date format`)
  const options = settings(field)
  return format(
    date,
    direction === 'write' && typeof options.format === 'string'
      ? options.format
      : dateInputFormat(field),
  )
}
