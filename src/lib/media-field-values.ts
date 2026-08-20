import { extensionCategories, getFileExtension } from './file-types'

import type { JsonObject, JsonValue } from './json'

export interface FieldMediaSchema {
  name: string
  input: string
  output: string
  extensions: string[]
}

type Field = JsonObject
type Direction = 'read' | 'write'

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function options(field: Field) {
  return isObject(field.options) ? field.options : undefined
}

export function resolveFieldMedia(field: Field, media: FieldMediaSchema[]) {
  const settings = options(field)
  if (settings?.media === false) return
  const requested =
    typeof settings?.media === 'string' ? settings.media : undefined
  return media.find((item) => item.name === requested) ?? media[0]
}

function normalizedExtensions(values: readonly unknown[]) {
  return [
    ...new Set(
      values.flatMap((value) =>
        typeof value === 'string'
          ? [value.replace(/^\./, '').toLowerCase()]
          : [],
      ),
    ),
  ]
}

export function allowedMediaFieldExtensions(
  field: Field,
  media: FieldMediaSchema | undefined,
) {
  const settings = options(field)
  const imageDefaults =
    field.type === 'image' ? [...extensionCategories.image] : []
  if (!media) return imageDefaults.length ? imageDefaults : undefined

  let allowed: string[]
  if (Array.isArray(settings?.extensions)) {
    allowed = normalizedExtensions(settings.extensions)
  } else if (Array.isArray(settings?.categories)) {
    allowed = normalizedExtensions(
      settings.categories.flatMap((category) =>
        typeof category === 'string' && category in extensionCategories
          ? extensionCategories[category as keyof typeof extensionCategories]
          : [],
      ),
    )
  } else {
    allowed = media.extensions.length
      ? normalizedExtensions(media.extensions)
      : imageDefaults
  }

  const mediaExtensions = normalizedExtensions(media.extensions)
  return allowed.length && mediaExtensions.length
    ? allowed.filter((extension) => mediaExtensions.includes(extension))
    : allowed
}

function isExternalPath(path: string) {
  return /^(?:https?:)?\/\//i.test(path) || path.startsWith('data:')
}

function swapPrefix(path: string, from: string, to: string, relative = false) {
  if (
    from === to ||
    isExternalPath(path) ||
    !path.startsWith(from) ||
    (from !== '/' &&
      from &&
      path.length > from.length &&
      path[from.length] !== '/')
  ) {
    return path
  }
  const remainder = from ? path.slice(from.length).replace(/^\//, '') : path
  let result =
    to === '/' ? `/${remainder}` : [to, remainder].filter(Boolean).join('/')
  if (relative && result.startsWith('/')) result = result.slice(1)
  return result
}

function transformMediaValue(
  value: JsonValue | undefined,
  field: Field,
  media: FieldMediaSchema[],
  direction: Direction,
): JsonValue | undefined {
  const schema = resolveFieldMedia(field, media)
  if (!schema) return value
  const transform = (item: JsonValue): JsonValue =>
    typeof item === 'string'
      ? direction === 'read'
        ? swapPrefix(item, schema.output, schema.input, true)
        : swapPrefix(item, schema.input, schema.output)
      : item
  return Array.isArray(value)
    ? value.map(transform)
    : value === undefined
      ? value
      : transform(value)
}

function transformScalar(
  value: JsonValue | undefined,
  field: Field,
  media: FieldMediaSchema[],
  direction: Direction,
): JsonValue | undefined {
  if (field.type === 'image' || field.type === 'file') {
    return transformMediaValue(value, field, media, direction)
  }
  if (field.type === 'object' && isObject(value)) {
    return transformObject(field.fields, value, media, direction)
  }
  if (field.type === 'block' && isObject(value)) {
    const key = typeof field.blockKey === 'string' ? field.blockKey : '_block'
    const selected = value[key]
    const block = Array.isArray(field.blocks)
      ? field.blocks.find(
          (candidate) =>
            isObject(candidate) &&
            typeof selected === 'string' &&
            candidate.name === selected,
        )
      : undefined
    return isObject(block)
      ? transformObject(block.fields, value, media, direction)
      : value
  }
  return value
}

function transformField(
  value: JsonValue | undefined,
  field: Field,
  media: FieldMediaSchema[],
  direction: Direction,
) {
  return field.list && Array.isArray(value)
    ? value.map(
        (item) => transformScalar(item, field, media, direction) ?? null,
      )
    : transformScalar(value, field, media, direction)
}

function transformObject(
  fields: unknown,
  content: JsonObject,
  media: FieldMediaSchema[],
  direction: Direction,
) {
  const result = { ...content }
  if (!Array.isArray(fields)) return result
  for (const candidate of fields) {
    if (!isObject(candidate) || typeof candidate.name !== 'string') continue
    const value = transformField(
      result[candidate.name],
      candidate,
      media,
      direction,
    )
    if (value === undefined) delete result[candidate.name]
    else result[candidate.name] = value
  }
  return result
}

export function transformMediaFieldValues(
  fields: unknown[],
  content: JsonObject | JsonValue[],
  media: FieldMediaSchema[],
  direction: Direction,
): JsonObject | JsonValue[] {
  return Array.isArray(content)
    ? content.map((item) =>
        isObject(item) ? transformObject(fields, item, media, direction) : item,
      )
    : transformObject(fields, content, media, direction)
}

function pathWithinRoot(path: string, root: string) {
  return (
    !isExternalPath(path) &&
    (!root || path === root || path.startsWith(`${root}/`))
  )
}

function validateMediaScalar(
  field: Field,
  value: JsonValue | undefined,
  media: FieldMediaSchema[],
  path: string,
) {
  if (field.type !== 'image' && field.type !== 'file') return []
  const schema = resolveFieldMedia(field, media)
  const allowed = allowedMediaFieldExtensions(field, schema)
  const values = Array.isArray(value) ? value : [value]
  const errors: string[] = []
  if (options(field)?.unique === true) {
    const paths = values.filter(
      (item): item is string => typeof item === 'string',
    )
    if (new Set(paths).size !== paths.length)
      errors.push(`${path} must be unique`)
  }
  for (const item of values) {
    if (typeof item !== 'string' || !item) continue
    if (schema && !pathWithinRoot(item, schema.input)) {
      errors.push(`${path} must be inside ${schema.input || 'the media root'}`)
    }
    const extension = getFileExtension(item.split(/[?#]/, 1)[0]).toLowerCase()
    if (allowed?.length && !allowed.includes(extension)) {
      errors.push(`${path} uses a disallowed file extension`)
    }
  }
  return errors
}

function validateObject(
  fields: unknown[],
  content: JsonObject,
  media: FieldMediaSchema[],
  parent = '',
) {
  const errors: string[] = []
  for (const candidate of fields) {
    if (!isObject(candidate) || typeof candidate.name !== 'string') continue
    const path = parent ? `${parent}.${candidate.name}` : candidate.name
    const raw = content[candidate.name]
    const values = candidate.list && Array.isArray(raw) ? raw : [raw]
    errors.push(...validateMediaScalar(candidate, raw, media, path))
    for (const value of values) {
      if (candidate.type === 'object' && isObject(value)) {
        errors.push(
          ...validateObject(
            Array.isArray(candidate.fields) ? candidate.fields : [],
            value,
            media,
            path,
          ),
        )
      } else if (candidate.type === 'block' && isObject(value)) {
        const key =
          typeof candidate.blockKey === 'string' ? candidate.blockKey : '_block'
        const block = Array.isArray(candidate.blocks)
          ? candidate.blocks.find(
              (item) => isObject(item) && item.name === value[key],
            )
          : undefined
        if (isObject(block)) {
          errors.push(
            ...validateObject(
              Array.isArray(block.fields) ? block.fields : [],
              value,
              media,
              path,
            ),
          )
        }
      }
    }
  }
  return errors
}

export function validateMediaFieldValues(
  fields: unknown[],
  content: JsonObject | JsonValue[],
  media: FieldMediaSchema[],
) {
  return Array.isArray(content)
    ? content.flatMap((item, index) =>
        isObject(item)
          ? validateObject(fields, item, media, `Item ${index + 1}`)
          : [],
      )
    : validateObject(fields, content, media)
}
