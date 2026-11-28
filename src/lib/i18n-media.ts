import { getGitParentPath, normalizeGitPath } from '#/shared/git-path'
import { rewriteMarkdownImages } from './markdown-images'
import { resolveFieldMedia, mediaOutputPath } from './media-field-values'
import { record } from './i18n'
import type { FieldMediaSchema } from './media-field-values'
import type { JsonObject, JsonValue } from '#/shared/json'

/** Rebase explicit file-relative asset references, without rewriting links or code. */
export function copyEntryMedia(
  fields: unknown[],
  content: JsonObject | JsonValue[],
  sourcePath: string,
  targetPath: string,
  media: FieldMediaSchema[],
): JsonObject | JsonValue[] {
  const asset = (value: string, field: JsonObject) => {
    if (!/^(?:\.\/|\.\.\/)/.test(value)) return value
    const [, path, suffix] = /^([^?#]*)(.*)$/.exec(value)!
    const absolute = normalizeGitPath(`${getGitParentPath(sourcePath)}/${path}`)
    const library = resolveFieldMedia(field, media)
    if (
      library &&
      (!library.input ||
        absolute === library.input ||
        absolute.startsWith(library.input + '/'))
    )
      return (
        (field.type === 'rich-text'
          ? mediaOutputPath(absolute, library)
          : absolute) + suffix
      )
    const from = getGitParentPath(targetPath).split('/').filter(Boolean)
    const to = absolute.split('/')
    while (from.length && to.length && from[0] === to[0]) {
      from.shift()
      to.shift()
    }
    return [...from.map(() => '..'), ...to].join('/') + suffix
  }
  const scalar = (field: JsonObject, value: JsonValue): JsonValue => {
    if (field.list && Array.isArray(value))
      return value.map((item) => scalar({ ...field, list: false }, item))
    if (field.type === 'image' || field.type === 'file') {
      const transform = (item: JsonValue) =>
        typeof item === 'string' ? asset(item, field) : item
      return Array.isArray(value) ? value.map(transform) : transform(value)
    }
    if (field.type === 'rich-text' && typeof value === 'string')
      return rewriteMarkdownImages(value, (url) => asset(url, field), true)
    if (field.type === 'object' && record(value))
      return object(Array.isArray(field.fields) ? field.fields : [], value)
    if (field.type === 'block' && record(value)) {
      const key = typeof field.blockKey === 'string' ? field.blockKey : '_block'
      const block = Array.isArray(field.blocks)
        ? field.blocks.find((item) => record(item) && item.name === value[key])
        : undefined
      return record(block)
        ? object(Array.isArray(block.fields) ? block.fields : [], value)
        : value
    }
    return value
  }
  const object = (schema: unknown[], value: JsonObject): JsonObject => {
    const result = { ...value }
    for (const field of schema)
      if (
        record(field) &&
        typeof field.name === 'string' &&
        Object.hasOwn(value, field.name)
      )
        result[field.name] = scalar(field as JsonObject, value[field.name])
    return result
  }
  return Array.isArray(content)
    ? content.map((item) => (record(item) ? object(fields, item) : item))
    : object(fields, content)
}
