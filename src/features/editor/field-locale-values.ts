import { isContentField } from '#/lib/content-field'
import type { JsonObject, JsonValue } from '#/shared/json'

// Independently translated lists have no shared item identity. Only copy the list itself.
export function fieldLocaleValues(
  translations: JsonObject,
  path: string[],
): JsonObject {
  return Object.fromEntries(
    Object.entries(translations).flatMap(([code, initial]) => {
      let value: JsonValue | undefined = initial
      for (const key of path) {
        if (!isContentField(value) || !Object.hasOwn(value, key)) return []
        value = value[key]
      }
      return [[code, value]]
    }),
  )
}
export function canCopyFieldLocale(
  translations: JsonObject,
  locale: string,
  path: string[],
) {
  let value: JsonValue | undefined = translations[locale]
  for (const key of path) {
    if (value !== undefined && !isContentField(value)) return false
    value = value && Object.hasOwn(value, key) ? value[key] : undefined
  }
  return true
}
export function copyFieldLocale(
  translations: JsonObject,
  source: string,
  target: string,
  path: string[],
): JsonObject {
  const values = fieldLocaleValues(translations, path)
  if (
    !Object.hasOwn(values, source) ||
    !canCopyFieldLocale(translations, target, path)
  )
    return translations
  const replace = (
    current: JsonValue | undefined,
    remaining: string[],
  ): JsonValue => {
    if (!remaining.length) return structuredClone(values[source]!)
    const [key, ...rest] = remaining
    const object = isContentField(current) ? current : {}
    return {
      ...object,
      [key]: replace(
        Object.hasOwn(object, key) ? object[key] : undefined,
        rest,
      ),
    }
  }
  return { ...translations, [target]: replace(translations[target], path) }
}
export function relativeLocaleFieldPath(
  boundary: string,
  field: string,
): string[] | undefined {
  if (field === boundary) return []
  return field.startsWith(boundary + '.')
    ? field.slice(boundary.length + 1).split('.')
    : undefined
}
