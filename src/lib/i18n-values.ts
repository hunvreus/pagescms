import { contentI18n, record } from './i18n'
import type { I18nSchema } from './i18n'
import type { JsonObject, JsonValue } from '#/shared/json'

type Node = Record<string, unknown>
const own = (value: object, key: string) => Object.hasOwn(value, key)
const put = (value: JsonObject, key: string, entry: JsonValue) =>
  Object.defineProperty(value, key, {
    value: entry,
    enumerable: true,
    configurable: true,
    writable: true,
  })
function children(node: Node, value: unknown): unknown[] {
  if (node.type !== 'block')
    return Array.isArray(node.fields) ? node.fields : []
  const key = typeof node.blockKey === 'string' ? node.blockKey : '_block'
  const block =
    Array.isArray(node.blocks) && record(value)
      ? node.blocks.find((item) => record(item) && item.name === value[key])
      : undefined
  return record(block) && Array.isArray(block.fields) ? block.fields : []
}

export function hasLocalizedValues(node: Node): boolean {
  return (
    node.localized === true ||
    ['fields', 'blocks'].some(
      (key) =>
        Array.isArray(node[key]) &&
        node[key].some((child) => record(child) && hasLocalizedValues(child)),
    )
  )
}

/** Apply existing field codecs only at ordinary subtrees, never to a locale map. */
export function transformLocalizedDocument(
  schema: I18nSchema,
  content: JsonObject | JsonValue[],
  transform: (
    fields: unknown[],
    value: JsonObject | JsonValue[],
  ) => JsonObject | JsonValue[],
): JsonObject | JsonValue[] {
  const config = contentI18n(schema)
  if (config?.scheme !== 'fields')
    return transform(Array.isArray(schema.fields) ? schema.fields : [], content)
  const codes = new Set(config.locales.map((locale) => locale.code))
  const walk = (
    node: Node,
    value: JsonValue,
    root = false,
  ): JsonValue | undefined => {
    if (node.localized === true) {
      if (!record(value)) return value
      const result: JsonObject = {}
      for (const [code, entry] of Object.entries(value)) {
        if (
          entry === null ||
          entry === '' ||
          entry === false ||
          entry === 0 ||
          (Array.isArray(entry) && !entry.length)
        ) {
          put(result, code, entry)
          continue
        }
        const mapped = codes.has(code)
          ? walk({ ...node, localized: false }, entry, root)
          : (entry as JsonValue)
        if (mapped !== undefined) put(result, code, mapped)
      }
      return result
    }
    if (node.list && Array.isArray(value))
      return value.map(
        (item) => walk({ ...node, list: false }, item, root) ?? null,
      )
    if (root || node.type === 'object' || node.type === 'block') {
      if (!record(value)) return value
      const fields = children(node, value)
      if (!hasLocalizedValues(node)) return transform(fields, value)
      const result = { ...value }
      for (const field of fields) {
        if (
          !record(field) ||
          typeof field.name !== 'string' ||
          !own(result, field.name)
        )
          continue
        if (hasLocalizedValues(field)) {
          const mapped = walk(field, result[field.name])
          if (mapped === undefined) delete result[field.name]
          else result[field.name] = mapped
        } else {
          const mapped = transform([field], {
            [field.name]: result[field.name]!,
          }) as JsonObject
          if (own(mapped, field.name)) result[field.name] = mapped[field.name]!
          else delete result[field.name]
        }
      }
      return result
    }
    const name = typeof node.name === 'string' ? node.name : 'value'
    const mapped = transform([{ ...node, name }], {
      [name]: value,
    }) as JsonObject
    return Object.hasOwn(mapped, name) ? mapped[name]! : undefined
  }
  return walk(schema, content, true) as JsonObject | JsonValue[]
}

/** Project a language for display without materializing missing translations. */
export function projectLocale(
  schema: I18nSchema,
  content: JsonValue,
  locale: string,
): JsonValue {
  const walk = (node: Node, value: JsonValue): JsonValue => {
    if (node.localized === true)
      return record(value) && own(value, locale)
        ? structuredClone(value[locale])
        : {}
    if (node.list && Array.isArray(value))
      return value.map((item) => walk({ ...node, list: false }, item))
    if (!record(value)) return value
    const result = { ...value }
    for (const field of children(node, value)) {
      if (
        !record(field) ||
        typeof field.name !== 'string' ||
        !own(value, field.name)
      )
        continue
      if (field.localized === true) {
        const map = value[field.name]
        if (record(map) && own(map, locale))
          result[field.name] = structuredClone(map[locale])
        else delete result[field.name]
      } else result[field.name] = walk(field, result[field.name])
    }
    return result
  }
  return walk(schema, content)
}

/** Copy only localized values. Explicit empty, false, zero and null are preserved. */
export function copyLocale(
  schema: I18nSchema,
  content: JsonValue,
  source: string,
  target: string,
  replace = false,
): JsonValue {
  const walk = (node: Node, value: JsonValue, path: string): JsonValue => {
    if (node.localized === true) {
      if (!record(value) || !own(value, source)) return value
      const fill = (from: unknown, to: unknown): unknown => {
        if (record(from) && record(to)) {
          let result = { ...to }
          for (const [key, entry] of Object.entries(from))
            result = {
              ...result,
              [key]: own(to, key)
                ? fill(entry, to[key])
                : structuredClone(entry),
            }
          return result
        }
        return to
      }
      return {
        ...value,
        [target]:
          !replace && own(value, target)
            ? fill(value[source], value[target])
            : structuredClone(value[source]),
      } as JsonObject
    }
    if (node.list && Array.isArray(value))
      return value.map((item, index) =>
        walk(
          { ...node, list: false },
          item,
          path ? `${path}.${index}` : String(index),
        ),
      )
    if (!record(value)) return value
    const result = { ...value }
    for (const field of children(node, value))
      if (
        record(field) &&
        typeof field.name === 'string' &&
        own(value, field.name)
      ) {
        const key = path ? `${path}.${field.name}` : field.name
        result[field.name] = walk(field, value[field.name], key)
      }
    return result
  }
  const settings = contentI18n(schema)
  if (
    settings &&
    ![source, target].every((code) =>
      settings.locales.some((item) => item.code === code),
    )
  )
    throw new Error('Unknown content locale')
  if (source === target) return content
  return walk(schema, content, '')
}

export function localizedFieldPaths(
  schema: I18nSchema,
  content: JsonValue,
  prefix = '',
): string[] {
  if (schema.localized === true) return [prefix]
  if (schema.list && Array.isArray(content))
    return content.flatMap((item, index) =>
      localizedFieldPaths(
        { ...schema, list: false },
        item,
        prefix ? `${prefix}.${index}` : String(index),
      ),
    )
  return children(schema, content).flatMap((field) =>
    record(field) && typeof field.name === 'string'
      ? localizedFieldPaths(
          field,
          record(content) ? (content[field.name] ?? {}) : {},
          prefix ? `${prefix}.${field.name}` : field.name,
        )
      : [],
  )
}

/** Conflict review displays the full file, including every configured language. */
export function localizedEditorFields(schema: I18nSchema): JsonObject[] {
  const config = contentI18n(schema)
  const expand = (node: Node): JsonObject => {
    if (node.localized === true && config)
      return {
        name: String(node.name ?? 'translations'),
        label: String(node.label ?? node.name ?? 'Translations'),
        type: 'object',
        fields: config.locales.map((locale) =>
          expand({
            ...node,
            name: locale.code,
            label: locale.label,
            localized: false,
          }),
        ),
      }
    return {
      ...node,
      ...(Array.isArray(node.fields)
        ? { fields: node.fields.filter(record).map(expand) }
        : {}),
      ...(Array.isArray(node.blocks)
        ? { blocks: node.blocks.filter(record).map(expand) }
        : {}),
    }
  }
  if (schema.localized === true)
    return (
      config?.locales.map((locale) =>
        expand({
          fields: schema.fields,
          ...(schema.list ? { list: schema.list } : {}),
          name: locale.code,
          label: locale.label,
          type: 'object',
          localized: false,
        }),
      ) ?? []
    )
  return (Array.isArray(schema.fields) ? schema.fields : [])
    .filter(record)
    .map(expand)
}

/** Preserve data outside this schema without restoring deliberately removed translations. */
export function preserveUnmanagedDocument(
  schema: I18nSchema,
  original: JsonValue,
  edited: JsonValue,
): JsonValue {
  const config = contentI18n(schema)
  const walk = (
    node: Node,
    before: JsonValue | undefined,
    next: JsonValue,
  ): JsonValue => {
    if (node.localized === true && record(next)) {
      const known = new Set(config?.locales.map((item) => item.code) ?? [])
      const result = Object.fromEntries(
        Object.entries(record(before) ? before : {}).filter(
          ([code]) => !known.has(code),
        ),
      )
      for (const [code, value] of Object.entries(next))
        put(
          result,
          code,
          known.has(code)
            ? walk(
                { ...node, localized: false },
                record(before) ? before[code] : undefined,
                value,
              )
            : value,
        )
      return result
    }
    // Independent lists have no implicit item identity; never merge them by index.
    if (Array.isArray(next)) return next
    if (!record(next)) return next
    if (node.type === 'block' && record(before)) {
      const key = typeof node.blockKey === 'string' ? node.blockKey : '_block'
      if (before[key] !== next[key]) return next
    }
    const fields = children(node, next).filter(record)
    const names = new Set(fields.map((field) => field.name))
    const result = {
      ...Object.fromEntries(
        Object.entries(record(before) ? before : {}).filter(
          ([name]) => !names.has(name),
        ),
      ),
      ...next,
    }
    for (const field of fields)
      if (typeof field.name === 'string' && own(next, field.name))
        result[field.name] = walk(
          field,
          record(before) ? before[field.name] : undefined,
          next[field.name],
        )
    return result
  }
  return walk(schema, original, edited)
}

export function localizedSnapshot(
  schema: I18nSchema,
  content: JsonValue,
  locale: string,
): unknown[] {
  const result: unknown[] = []
  const walk = (node: Node, value: unknown) => {
    if (node.localized === true) {
      result.push(
        record(value) && Object.hasOwn(value, locale)
          ? [true, value[locale]]
          : [false],
      )
      return
    }
    if (node.list && Array.isArray(value)) {
      for (const item of value) walk({ ...node, list: false }, item)
      return
    }
    for (const field of children(node, value))
      if (record(field) && typeof field.name === 'string')
        walk(field, record(value) ? value[field.name] : undefined)
  }
  walk(schema, content)
  return result
}

/** Presence includes intentionally empty values; it does not claim completeness. */
export function hasLocaleData(
  schema: I18nSchema,
  content: JsonValue,
  locale: string,
): boolean {
  return localizedSnapshot(schema, content, locale).some(
    (value) => Array.isArray(value) && value[0] === true,
  )
}

export function issueLocale(
  schema: I18nSchema,
  content: JsonValue,
  path: string,
): string | undefined {
  const codes = contentI18n(schema)?.locales.map((item) => item.code) ?? []
  const boundaries = localizedFieldPaths(schema, content).map(
    (fieldPath) => fieldPath || 'translations',
  )
  return codes.find((code) =>
    boundaries.some(
      (boundary) =>
        path === `${boundary}.${code}` ||
        path.startsWith(`${boundary}.${code}.`),
    ),
  )
}

export function removeLocale(
  schema: I18nSchema,
  content: JsonValue,
  locale: string,
): JsonValue {
  const walk = (node: Node, value: JsonValue): JsonValue => {
    if (node.localized === true && record(value)) {
      const result = { ...value }
      delete result[locale]
      return result
    }
    if (node.list && Array.isArray(value))
      return value.map((item) => walk({ ...node, list: false }, item))
    if (!record(value)) return value
    const result = { ...value }
    for (const field of children(node, value))
      if (
        record(field) &&
        typeof field.name === 'string' &&
        Object.hasOwn(value, field.name)
      )
        result[field.name] = walk(field, value[field.name])
    return result
  }
  return walk(schema, content)
}
