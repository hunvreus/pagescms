import { normalizeGitPath } from './git-path'

export type ContentSchema = Record<string, unknown> & {
  type: 'collection' | 'file'
  name: string
  path: string
}

export type MediaSchema = Record<string, unknown> & {
  name: string
  input: string
  output: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function findInItems(values: unknown, name: string): ContentSchema | undefined {
  if (!Array.isArray(values)) return
  for (const value of values) {
    if (!isRecord(value)) continue
    if (value.type === 'group') {
      const nested = findInItems(value.items, name)
      if (nested) return nested
      continue
    }
    if (
      (value.type === 'collection' || value.type === 'file') &&
      value.name === name &&
      typeof value.path === 'string'
    ) {
      return value as ContentSchema
    }
  }
}

export function findContentSchema(
  configuration: Record<string, unknown>,
  name: string,
): ContentSchema | undefined {
  return findInItems(configuration.content, name)
}

export function findMediaSchema(
  configuration: Record<string, unknown>,
  name: string,
): MediaSchema | undefined {
  if (!Array.isArray(configuration.media)) return
  const value = configuration.media.find(
    (candidate) => isRecord(candidate) && candidate.name === name,
  )
  if (
    !isRecord(value) ||
    typeof value.name !== 'string' ||
    typeof value.input !== 'string' ||
    typeof value.output !== 'string'
  ) {
    return
  }
  return value as MediaSchema
}

export function configuredMediaSchemas(configuration: Record<string, unknown>) {
  if (!Array.isArray(configuration.media)) return []
  return configuration.media.flatMap((value) => {
    if (
      !isRecord(value) ||
      typeof value.name !== 'string' ||
      typeof value.input !== 'string' ||
      typeof value.output !== 'string'
    ) {
      return []
    }
    return [
      {
        name: value.name,
        label:
          typeof value.label === 'string' && value.label
            ? value.label
            : value.name,
        input: value.input,
        output: value.output,
        extensions: Array.isArray(value.extensions)
          ? value.extensions.filter(
              (extension): extension is string => typeof extension === 'string',
            )
          : [],
      },
    ]
  })
}

export function mediaDirectoryPath(
  schema: MediaSchema,
  requestedPath?: string,
) {
  const root = normalizeGitPath(schema.input)
  const path = requestedPath ? normalizeGitPath(requestedPath) : root
  if (path !== root && !path.startsWith(root ? `${root}/` : '')) {
    throw new Error('Media path is outside its configured root')
  }
  return path
}

export function collectionDirectoryPath(
  schema: ContentSchema,
  requestedPath?: string,
) {
  if (schema.type !== 'collection')
    throw new Error('Schema is not a collection')
  const root = normalizeGitPath(schema.path)
  const path = requestedPath ? normalizeGitPath(requestedPath) : root
  if (path !== root && !path.startsWith(`${root}/`)) {
    throw new Error('Collection path is outside its configured root')
  }
  if (schema.subfolders === false && path !== root) {
    throw new Error('This collection does not allow subfolders')
  }
  return path
}
