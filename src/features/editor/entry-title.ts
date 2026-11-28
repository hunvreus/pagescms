import { isRecord } from '#/shared/json'
import { contentI18n } from '#/lib/i18n'
import { projectLocale } from '#/lib/i18n-values'
import type { I18nSchema } from '#/lib/i18n'
import type { JsonValue } from '#/shared/json'

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
  schemaType,
  label,
  schema,
  locale,
}: {
  content?: unknown
  filename: string
  primaryField?: string
  schemaType?: string
  label?: string
  schema?: I18nSchema
  locale?: string
}) {
  if (schemaType === 'file') return label?.trim() || filename
  const i18n = schema && contentI18n(schema)
  const displayContent =
    schema && i18n?.scheme === 'fields' && content != null
      ? projectLocale(schema, content as JsonValue, locale || i18n.default)
      : content
  const primaryValue = primaryField
    ? valueAtPath(displayContent, primaryField)
    : undefined
  const value =
    (typeof primaryValue === 'string' && primaryValue.trim() !== '') ||
    typeof primaryValue === 'number' ||
    typeof primaryValue === 'boolean'
      ? String(primaryValue)
      : filename
  return value
}

export function getEntryDisplayTitle(
  input: Parameters<typeof getEntryTitle>[0] & { creating?: boolean },
) {
  return input.creating ? 'New entry' : `Editing "${getEntryTitle(input)}"`
}
