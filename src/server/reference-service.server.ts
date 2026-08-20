import { isCacheEnabled } from '#/lib/configuration'
import {
  collectionDirectoryPath,
  findContentSchema,
} from '#/lib/configuration-content'
import { parseContent } from '#/lib/content-serialization'

import { createConfigurationStore } from './configuration-store.server'
import { createDirectoryCache } from './directory-cache.server'

import type {
  ContentFormat,
  FrontmatterDelimiters,
} from '#/lib/content-serialization'
import type { Database } from './database/client.server'
import type { ProjectUser } from './projects.server'
import type { RepositoryAccessService } from './repository-access.server'
import type { BackgroundExecutor } from './runtime-ports.server'

const formats = new Set<ContentFormat>([
  'yaml-frontmatter',
  'json-frontmatter',
  'toml-frontmatter',
  'yaml',
  'json',
  'toml',
])
const MAX_REFERENCE_DIRECTORIES = 50
const MAX_REFERENCE_OPTIONS = 100

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function access(value: unknown, path: string) {
  let cursor: unknown = value
  for (const segment of path.split('.').filter(Boolean)) {
    if (!isRecord(cursor)) return undefined
    cursor = cursor[segment]
  }
  return cursor
}

function primaryField(schema: Record<string, unknown>) {
  const view = isRecord(schema.view) ? schema.view : {}
  if (typeof view.primary === 'string' && view.primary) return view.primary
  const fields = Array.isArray(schema.fields) ? schema.fields : []
  const first = fields.find(
    (field) =>
      isRecord(field) &&
      typeof field.name === 'string' &&
      field.type !== 'object' &&
      field.type !== 'block',
  )
  const title = fields.find(
    (field) => isRecord(field) && field.name === 'title',
  )
  const selected = title ?? first
  return isRecord(selected) && typeof selected.name === 'string'
    ? selected.name
    : undefined
}

function interpolate(
  template: string,
  item: {
    name: string
    path: string
    primary: unknown
    fields: Record<string, unknown>
  },
) {
  return template.replaceAll(/\{([^}]+)\}/g, (_match, token: string) => {
    const value =
      token === 'name' || token === 'path' || token === 'primary'
        ? item[token]
        : access(item.fields, token.replace(/^fields\./, ''))
    return value === undefined || value === null ? '' : String(value)
  })
}

export async function loadReferenceOptions(input: {
  database: Database
  background: BackgroundExecutor
  repositoryAccess: RepositoryAccessService
  user: ProjectUser
  owner: string
  repo: string
  branch: string
  collection: string
  query: string
  valueTemplate: string
  labelTemplate: string
  searchFields: string[]
  selectedValues: string[]
}) {
  const { api } = await input.repositoryAccess.resolve(
    input.user,
    input.owner,
    input.repo,
    input.branch,
  )
  const configuration = await createConfigurationStore({
    database: input.database,
    background: input.background,
  }).get(api, input.owner, input.repo, input.branch)
  if (!configuration) throw new Error('Repository configuration not found')
  const schema = findContentSchema(configuration.object, input.collection)
  if (!schema || schema.type !== 'collection') {
    throw new Error(`Reference collection ${input.collection} was not found`)
  }
  const root = collectionDirectoryPath(schema)
  const cache = createDirectoryCache({
    database: input.database,
    background: input.background,
  })
  const directories = [root]
  const entries: Awaited<ReturnType<typeof api.getDirectory>> = []
  let visited = 0
  while (directories.length && visited < MAX_REFERENCE_DIRECTORIES) {
    const batch = directories.splice(0, 5)
    visited += batch.length
    const results = await Promise.all(
      batch.map((path) =>
        cache.get({
          api,
          owner: input.owner,
          repo: input.repo,
          branch: input.branch,
          path,
          context: 'collection',
          enabled: isCacheEnabled(configuration.object),
        }),
      ),
    )
    for (const result of results) {
      for (const entry of result.entries) {
        if (entry.type === 'dir' && schema.subfolders !== false) {
          directories.push(entry.path)
        } else if (entry.type === 'file') {
          entries.push(entry)
        }
      }
    }
  }
  const extension = typeof schema.extension === 'string' ? schema.extension : ''
  const excluded = new Set(
    Array.isArray(schema.exclude)
      ? schema.exclude.filter(
          (value): value is string => typeof value === 'string',
        )
      : [],
  )
  const format =
    typeof schema.format === 'string' &&
    formats.has(schema.format as ContentFormat)
      ? (schema.format as ContentFormat)
      : undefined
  const primary = primaryField(schema)
  const query = input.query.toLowerCase()
  const selected = new Set(input.selectedValues)
  return entries
    .filter(
      (entry) =>
        !excluded.has(entry.name) &&
        (!extension || entry.path.endsWith(`.${extension}`)),
    )
    .flatMap((entry) => {
      let fields: Record<string, unknown> = {}
      if (format && entry.content !== null) {
        try {
          const parsed = parseContent(entry.content, {
            format,
            delimiters: schema.delimiters as FrontmatterDelimiters | undefined,
          })
          if (isRecord(parsed)) fields = parsed
        } catch {
          return []
        }
      }
      const item = {
        name: entry.name,
        path: entry.path,
        primary: primary ? access(fields, primary) : undefined,
        fields,
      }
      const option = {
        value: interpolate(input.valueTemplate, item),
        label: interpolate(input.labelTemplate, item),
      }
      if (!option.value) return []
      if (selected.size) return selected.has(option.value) ? [option] : []
      if (
        query &&
        !input.searchFields.some((field) => {
          const value =
            field === 'name' || field === 'path' || field === 'primary'
              ? item[field]
              : access(fields, field.replace(/^fields\./, ''))
          return String(value ?? '')
            .toLowerCase()
            .includes(query)
        })
      ) {
        return []
      }
      return [option]
    })
    .slice(0, MAX_REFERENCE_OPTIONS)
}
