import { parse as parseToml, stringify as stringifyToml } from 'smol-toml'
import YAML from 'yaml'

export type SerializedFormat = 'json' | 'yaml' | 'toml'
export type FrontmatterFormat =
  'json-frontmatter' | 'yaml-frontmatter' | 'toml-frontmatter'
export type ContentFormat = SerializedFormat | FrontmatterFormat
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
    return YAML.parse(source, { strict: false, uniqueKeys: false })
  }
  if (format === 'json') return JSON.parse(source) as unknown

  return JSON.parse(JSON.stringify(parseToml(source))) as unknown
}

function serializeRecord(value: ContentRecord, format: SerializedFormat) {
  if (Object.keys(value).length === 0) return ''
  if (format === 'yaml') return YAML.stringify(value)
  if (format === 'json') return JSON.stringify(value, null, 2)
  return stringifyToml(value)
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
  const match = new RegExp(
    `^${start}\\r?\\n([\\s\\S]*?)\\r?\\n${end}(?:\\r?\\n([\\s\\S]*))?$`,
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
  content: ContentRecord = {},
  options: {
    delimiters?: FrontmatterDelimiters
    format?: ContentFormat
  } = {},
) {
  const format = options.format ?? 'yaml-frontmatter'
  if (format === 'yaml' || format === 'json' || format === 'toml') {
    return serializeRecord(content, format)
  }

  const delimiters = setFrontmatterDelimiters(options.delimiters, format)
  const copy = structuredClone(content)
  const rawBody = copy.body
  const body = rawBody ? String(rawBody) : ''
  delete copy.body

  const serialized = serializeRecord(
    copy,
    format.split('-')[0] as SerializedFormat,
  ).trim()
  const frontmatter = serialized ? `${serialized}\n` : ''

  if (
    format === 'json-frontmatter' &&
    delimiters[0] === '{' &&
    delimiters[1] === '}'
  ) {
    return `${frontmatter}${body}`
  }

  return `${delimiters[0]}\n${frontmatter}${delimiters[1]}\n${body}`
}
