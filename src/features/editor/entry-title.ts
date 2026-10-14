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

export function getEntryTitle({
  content,
  filename,
  primaryField,
}: {
  content?: unknown
  filename: string
  primaryField?: string
}) {
  const primaryValue = primaryField
    ? valueAtPath(content, primaryField)
    : undefined
  const value =
    primaryValue !== undefined && primaryValue !== null && primaryValue !== ''
      ? String(primaryValue)
      : filename
  return value
}

export function getEntryDisplayTitle(
  input: Parameters<typeof getEntryTitle>[0] & { creating?: boolean },
) {
  return input.creating ? 'New entry' : `Editing "${getEntryTitle(input)}"`
}
