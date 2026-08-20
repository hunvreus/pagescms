import {
  collectionDirectoryPath,
  configuredMediaSchemas,
  findContentSchema,
} from '#/lib/configuration-content'
import { schemaActions } from '#/lib/actions'
import { isCacheEnabled } from '#/lib/configuration'
import { parseContent } from '#/lib/content-serialization'
import { resolveContentOperations } from '#/lib/content-operations'
import { toJsonValue } from '#/lib/json'

import { createConfigurationStore } from './configuration-store.server'
import { createDirectoryCache } from './directory-cache.server'

import type {
  ContentFormat,
  FrontmatterDelimiters,
} from '#/lib/content-serialization'
import type { JsonValue } from '#/lib/json'
import type { Database } from './database/client.server'
import type { BackgroundExecutor } from './runtime-ports.server'
import type { ProjectUser } from './projects.server'
import type { RepositoryAccessService } from './repository-access.server'

const serializedFormats = new Set<ContentFormat>([
  'yaml-frontmatter',
  'json-frontmatter',
  'toml-frontmatter',
  'yaml',
  'json',
  'toml',
])

type CollectionEntry =
  | {
      type: 'dir'
      name: string
      path: string
      parentPath: string
    }
  | {
      type: 'file'
      sha: string | null
      name: string
      path: string
      parentPath: string
      isNode: boolean
      fields: JsonValue
    }

function contentFormat(value: unknown): ContentFormat | undefined {
  return typeof value === 'string' &&
    serializedFormats.has(value as ContentFormat)
    ? (value as ContentFormat)
    : undefined
}

function delimiters(value: unknown): FrontmatterDelimiters | undefined {
  if (typeof value === 'string') return value
  if (
    Array.isArray(value) &&
    value.every((item): item is string => typeof item === 'string')
  ) {
    return value
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function dateFromFilename(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  return match ? `${match[1]}-${match[2]}-${match[3]}` : undefined
}

export async function loadCollection({
  database,
  background,
  repositoryAccess,
  user,
  owner,
  repo,
  branch,
  name,
  path,
}: {
  database: Database
  background: BackgroundExecutor
  repositoryAccess: RepositoryAccessService
  user: ProjectUser
  owner: string
  repo: string
  branch: string
  name: string
  path?: string
}) {
  const { api } = await repositoryAccess.resolve(user, owner, repo, branch)
  const configuration = await createConfigurationStore({
    database,
    background,
  }).get(api, owner, repo, branch)
  if (!configuration) throw new Error('Repository configuration not found')
  const schema = findContentSchema(configuration.object, name)
  if (!schema || schema.type !== 'collection') {
    throw new Error(`Collection ${name} was not found`)
  }
  const view = isRecord(schema.view) ? schema.view : {}
  const node = isRecord(view.node) ? view.node : undefined
  const nodeFilename =
    typeof node?.filename === 'string' && node.filename
      ? node.filename
      : undefined
  const directory = collectionDirectoryPath(schema, path)
  const directoryResult = await createDirectoryCache({
    database,
    background,
  }).get({
    api,
    owner,
    repo,
    branch,
    path: directory,
    context: 'collection',
    enabled: isCacheEnabled(configuration.object),
    nodeFilename,
  })
  let entries = directoryResult.entries.map((entry) => {
    const separator = entry.path.lastIndexOf('/')
    const parentPath = separator === -1 ? '' : entry.path.slice(0, separator)
    return {
      ...entry,
      parentPath,
      isNode:
        entry.type === 'file' &&
        entry.name === nodeFilename &&
        parentPath !== directory,
    }
  })
  if (nodeFilename) {
    entries = entries.filter(
      (entry) =>
        entry.isNode ||
        entry.parentPath === schema.path ||
        entry.name !== nodeFilename,
    )
    const nodeParents = new Set(
      entries.filter((entry) => entry.isNode).map((entry) => entry.parentPath),
    )
    const hideDirs = node?.hideDirs
    if (hideDirs === 'all') {
      entries = entries.filter((entry) => entry.type !== 'dir')
    } else if (hideDirs === 'nodes') {
      entries = entries.filter(
        (entry) => entry.type !== 'dir' || !nodeParents.has(entry.path),
      )
    } else if (hideDirs === 'others') {
      entries = entries.filter(
        (entry) => entry.type !== 'dir' || nodeParents.has(entry.path),
      )
    }
  }
  const extension =
    typeof schema.extension === 'string' && schema.extension
      ? `.${schema.extension}`
      : ''
  const excluded = new Set(
    Array.isArray(schema.exclude)
      ? schema.exclude.filter(
          (value): value is string => typeof value === 'string',
        )
      : [],
  )
  const format = contentFormat(schema.format)
  const hasFields = Array.isArray(schema.fields) && schema.fields.length > 0
  const errors: string[] = []
  const contents: CollectionEntry[] = []

  for (const entry of entries) {
    if (entry.name === '.gitkeep') continue
    if (excluded.has(entry.name)) continue
    if (entry.type === 'dir') {
      if (schema.subfolders !== false) {
        contents.push({
          type: 'dir',
          name: entry.name,
          path: entry.path,
          parentPath: entry.parentPath,
        })
      }
      continue
    }
    if (extension && !entry.path.endsWith(extension)) continue

    let fields: JsonValue = { name: entry.name }
    if (format && hasFields && entry.content !== null) {
      try {
        const parsed = parseContent(entry.content, {
          format,
          delimiters: delimiters(schema.delimiters),
        })
        fields = toJsonValue(parsed)
        if (
          typeof fields === 'object' &&
          fields !== null &&
          !Array.isArray(fields) &&
          !('date' in fields) &&
          typeof schema.filename === 'string' &&
          schema.filename.startsWith('{year}-{month}-{day}')
        ) {
          const date = dateFromFilename(entry.name)
          if (date) fields.date = date
        }
      } catch (error) {
        errors.push(
          `Could not parse ${entry.path}: ${error instanceof Error ? error.message : 'unknown error'}`,
        )
      }
    }
    contents.push({
      type: 'file',
      sha: entry.sha,
      name: entry.name,
      path: entry.path,
      parentPath: entry.parentPath,
      isNode: entry.isNode,
      fields,
    })
  }

  return {
    collection: {
      name: schema.name,
      label:
        typeof schema.label === 'string' && schema.label
          ? schema.label
          : schema.name,
      path: directory,
      rootPath: schema.path,
      format: typeof schema.format === 'string' ? schema.format : null,
      subfolders: schema.subfolders !== false,
      fields: toJsonValue(Array.isArray(schema.fields) ? schema.fields : []),
      filenameField:
        schema.filenameField === true || schema.filenameField === 'create',
      view: toJsonValue(
        typeof schema.view === 'object' && schema.view !== null
          ? schema.view
          : {},
      ),
      operations: resolveContentOperations({ schema }),
      actions: schemaActions(schema, 'collection'),
    },
    contents,
    errors,
    media: configuredMediaSchemas(configuration.object),
    stale: directoryResult.stale,
  }
}
