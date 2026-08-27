function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function valueAtPath(value: unknown, path: string) {
  let current = value
  for (const segment of path.split('.')) {
    if (!isRecord(current)) return
    current = current[segment]
  }
  return current
}

export function getEntryDisplayTitle({
  content,
  creating = false,
  filename,
  primaryField,
}: {
  content?: unknown
  creating?: boolean
  filename: string
  primaryField?: string
}) {
  if (creating) return 'New entry'
  const primaryValue = primaryField
    ? valueAtPath(content, primaryField)
    : undefined
  const value =
    primaryValue !== undefined && primaryValue !== null && primaryValue !== ''
      ? String(primaryValue)
      : filename
  return `Editing "${value}"`
}
