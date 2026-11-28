import { limitAliasExpansion } from '#/shared/yaml-aliases'
import {
  TomlDate,
  parse as parseToml,
  stringify as stringifyToml,
} from 'smol-toml'
import {
  CORE_SCHEMA,
  DEFAULT_SCALAR_STYLE_RULES,
  SCALAR_STYLE,
  dump,
  load,
} from 'js-yaml'

import type { JsonObject, JsonValue } from '#/shared/json'

export type SerializedFormat = 'json' | 'yaml' | 'toml'
export type FrontmatterFormat =
  'json-frontmatter' | 'yaml-frontmatter' | 'toml-frontmatter'
export type ContentFormat = SerializedFormat | FrontmatterFormat
export const contentFormats: ReadonlySet<ContentFormat> = new Set([
  'json',
  'yaml',
  'toml',
  'json-frontmatter',
  'yaml-frontmatter',
  'toml-frontmatter',
])
export type FrontmatterDelimiters = string | readonly string[]

type ContentRecord = Record<string, unknown>

function isRecord(value: unknown): value is ContentRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function setFrontmatterDelimiters(
  delimiters: FrontmatterDelimiters | null | undefined,
  format: FrontmatterFormat,
): [string, string] {
  if (delimiters == null) {
    if (format === 'toml-frontmatter') return ['+++', '+++']
    if (format === 'json-frontmatter') return ['{', '}']
    return ['---', '---']
  }

  if (typeof delimiters === 'string') return [delimiters, delimiters]
  if (
    Array.isArray(delimiters) &&
    delimiters.length === 2 &&
    typeof delimiters[0] === 'string' &&
    typeof delimiters[1] === 'string'
  ) {
    return [delimiters[0], delimiters[1]]
  }

  throw new Error('Frontmatter delimiters must be one string or two strings')
}

function deserializeContent(source: string, format: SerializedFormat): unknown {
  if (!source.trim()) return {}

  if (format === 'yaml') {
    const value = load(source, { schema: CORE_SCHEMA, json: true })
    limitAliasExpansion(value)
    return value
  }
  if (format === 'json') return JSON.parse(source) as unknown

  return JSON.parse(JSON.stringify(parseToml(source))) as unknown
}

type StructuredValue = JsonObject | JsonValue[]

function restoreTomlDates(value: JsonValue, original: unknown): unknown {
  if (original instanceof TomlDate && original.toJSON() === value)
    return original
  if (Array.isArray(value) && Array.isArray(original))
    return value.map((item, index) => restoreTomlDates(item, original[index]))
  if (isRecord(value) && isRecord(original))
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        restoreTomlDates(
          item,
          Object.hasOwn(original, key) ? original[key] : undefined,
        ),
      ]),
    )
  return value
}

function serializeValue(
  value: StructuredValue,
  format: SerializedFormat,
  originalSource?: string,
) {
  if (format === 'toml' && Array.isArray(value)) {
    throw new Error('TOML documents cannot contain a list at the root')
  }
  if (!Array.isArray(value) && Object.keys(value).length === 0) return ''
  if (format === 'yaml')
    return dump(value, {
      schema: CORE_SCHEMA,
      quoteStyle: 'double',
      scalarStyleRules: [
        ...Object.values(DEFAULT_SCALAR_STYLE_RULES),
        (layout) => {
          if (layout.style === SCALAR_STYLE.SINGLE_QUOTED)
            layout.style = SCALAR_STYLE.DOUBLE_QUOTED
        },
      ],
    })
  if (format === 'json') return JSON.stringify(value, null, 2)
  return stringifyToml(
    originalSource ? restoreTomlDates(value, parseToml(originalSource)) : value,
  )
}

function escapeRegularExpression(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function findJsonObjectBoundary(source: string) {
  if (!source.startsWith('{')) return -1

  let depth = 0
  let inString = false
  let escaped = false

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]

    if (inString) {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === '"') inString = false
      continue
    }

    if (character === '"') inString = true
    else if (character === '{') depth += 1
    else if (character === '}') {
      depth -= 1
      if (depth === 0) return index + 1
    }
  }

  return -1
}

function splitFrontmatter(
  source: string,
  format: FrontmatterFormat,
  delimiters: [string, string],
): { frontmatter: string; body: string } | undefined {
  if (
    format === 'json-frontmatter' &&
    delimiters[0] === '{' &&
    delimiters[1] === '}'
  ) {
    const boundary = findJsonObjectBoundary(source)
    if (boundary === -1) return
    return {
      frontmatter: source.slice(0, boundary),
      body: source.slice(boundary).replace(/^(?:\r?\n)+/, ''),
    }
  }

  const start = escapeRegularExpression(delimiters[0])
  const end = escapeRegularExpression(delimiters[1])
  // Prefer an immediate closing delimiter over consuming it as metadata.
  const match = new RegExp(
    `^${start}\\r?\\n(?:([\\s\\S]*?)\\r?\\n)??${end}(?:\\r?\\n([\\s\\S]*))?$`,
  ).exec(source)

  if (!match) return
  return { frontmatter: match.at(1) ?? '', body: match.at(2) ?? '' }
}

export function parseContent(
  source = '',
  options: {
    delimiters?: FrontmatterDelimiters
    format?: ContentFormat
  } = {},
): unknown {
  const format = options.format ?? 'yaml-frontmatter'
  if (format === 'yaml' || format === 'json' || format === 'toml') {
    return deserializeContent(source, format)
  }

  const delimiters = setFrontmatterDelimiters(options.delimiters, format)
  const parts = splitFrontmatter(source, format, delimiters)
  if (!parts) return { body: source }

  const value = deserializeContent(
    parts.frontmatter,
    format.split('-')[0] as SerializedFormat,
  )
  if (!isRecord(value)) {
    throw new Error('Frontmatter must contain an object')
  }

  return { ...value, body: parts.body.replace(/^\r?\n/, '') }
}

export function serializeContent(
  content: StructuredValue = {},
  options: {
    originalSource?: string
    delimiters?: FrontmatterDelimiters
    format?: ContentFormat
  } = {},
) {
  const format = options.format ?? 'yaml-frontmatter'
  if (format === 'yaml' || format === 'json' || format === 'toml') {
    if (format === 'json') return JSON.stringify(content, null, 2)
    return serializeValue(content, format, options.originalSource)
  }

  if (!isRecord(content)) {
    throw new Error('Frontmatter content must contain an object')
  }

  const delimiters = setFrontmatterDelimiters(options.delimiters, format)
  const copy = { ...content }
  const rawBody = copy.body
  const body = rawBody ? String(rawBody) : ''
  delete copy.body

  const serialized = serializeValue(
    copy,
    format.split('-')[0] as SerializedFormat,
    format === 'toml-frontmatter' && options.originalSource
      ? splitFrontmatter(options.originalSource, format, delimiters)
          ?.frontmatter
      : undefined,
  ).trim()
  const frontmatter = serialized ? `${serialized}\n` : ''

  if (
    format === 'json-frontmatter' &&
    delimiters[0] === '{' &&
    delimiters[1] === '}'
  ) {
    // Keep an explicit empty object so a body starting with JSON stays body text.
    return `${frontmatter || '{}\n'}${body}`
  }

  return `${delimiters[0]}\n${frontmatter}${delimiters[1]}\n${body}`
}
