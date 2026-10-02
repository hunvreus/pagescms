import type { JsonObject } from './json'

export function selectOptions(field: Record<string, unknown>) {
  const options = field.options as JsonObject | undefined
  const values = options?.values
  if (!Array.isArray(values)) return []
  const result = new Map<string, { value: string; label: string }>()
  for (const option of values) {
    const record =
      typeof option === 'object' && option !== null && !Array.isArray(option)
        ? option
        : undefined
    const value = record ? (record.value ?? record.name) : option
    if (!['string', 'number', 'boolean'].includes(typeof value)) continue
    const key = String(value)
    if (!key) continue
    result.set(key, {
      value: key,
      label: typeof record?.label === 'string' ? record.label : key,
    })
  }
  return [...result.values()]
}
