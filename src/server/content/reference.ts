import { isRecord, toJsonValue } from '#/shared/json'
import { configurationStoreFor } from '#/server/cache/configuration-access'
import { contentI18n, canonicalEntryPath } from '#/lib/i18n'
import { projectLocale } from '#/lib/i18n-values'
import { localizedDirectory } from './localized-directory'
import {
  collectionDirectoryPath,
  configuredMediaSchemas,
  findContentSchema,
} from '#/shared/configuration-content'
import { transformMediaFieldValues } from '#/lib/media-field-values'
import { contentFormats, parseContent } from '#/shared/content-serialization'
import { getContentPrimaryField } from '#/lib/content-filename'
import { transformContentFields } from '#/lib/content-field-values'
import { normalizeGitPath } from '#/shared/git-path'
import { admittedConfigurationScope } from '#/server/cache/configuration'
import type {
  ContentFormat,
  FrontmatterDelimiters,
} from '#/shared/content-serialization'
import type { JsonObject, JsonValue } from '#/shared/json'
import type { Database } from '#/server/db/client'
import type { RepositoryUser } from '../repository/repositories'
import type { RepositoryAccessService } from '#/server/access/repository'

const MAX_DIRECTORIES = 50
const MAX_OPTIONS = 100
function access(value: unknown, path: string): unknown {
  let cursor = value
  for (const segment of path
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(Boolean)) {
    if (
      segment === '__proto__' ||
      segment === 'constructor' ||
      segment === 'prototype'
    )
      return
    if (
      !cursor ||
      typeof cursor !== 'object' ||
      !Object.hasOwn(cursor, segment)
    )
      return
    cursor = (cursor as Record<string, unknown>)[segment]
  }
  return cursor
}
function interpolate(
  template: string,
  item: Record<string, unknown>,
  fields: Record<string, unknown>,
) {
  return template.replace(
    /\\([{}])|\{([^}]+)\}/g,
    (_match, escaped: string | undefined, token: string) => {
      if (escaped) return escaped
      const value = ['name', 'path', 'primary', 'locale'].includes(token)
        ? item[token]
        : access(fields, token.replace(/^fields\./, ''))
      return value === undefined || value === null ? '' : String(value)
    },
  )
}
interface Cursor {
  directories: string[]
  offset: number
}
function parseCursor(raw: string | undefined, root: string): Cursor {
  if (!raw) return { directories: [root], offset: 0 }
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    throw new Error('Invalid reference continuation')
  }
  if (
    !isRecord(value) ||
    !Array.isArray(value.directories) ||
    !value.directories.length ||
    value.directories.length > 10000 ||
    !Number.isSafeInteger(value.offset) ||
    Number(value.offset) < 0 ||
    !value.directories.every(
      (path) =>
        typeof path === 'string' &&
        normalizeGitPath(path) === path &&
        (!root || path === root || path.startsWith(`${root}/`)),
    )
  )
    throw new Error('Invalid reference continuation')
  return value as unknown as Cursor
}

export async function loadReferenceOptions(input: {
  database: Database
  repositoryAccess: RepositoryAccessService
  user: RepositoryUser
  owner: string
  repo: string
  branch: string
  repoId?: string
  collection: string
  query: string
  valueTemplate: string
  labelTemplate: string
  searchFields: string[]
  selectedValues: string[]
  cursor?: string
  locale?: string
}) {
  const {
    api,
    repository,
    identity: admittedIdentity,
  } = await input.repositoryAccess.resolve(
    input.user,
    input.owner,
    input.repo,
    input.branch,
    input.repoId,
  )
  const configuration = await configurationStoreFor(
    input.repositoryAccess,
    input.database,
  ).get(
    api,
    input.owner,
    input.repo,
    input.branch,
    repository ? String(repository.id) : undefined,
    repository && admittedConfigurationScope(admittedIdentity),
  )
  if (!configuration) throw new Error('Repository configuration not found')
  const schema = findContentSchema(configuration.object, input.collection)
  if (!schema || schema.type !== 'collection')
    throw new Error(`Reference collection ${input.collection} was not found`)
  const mediaSchemas = configuredMediaSchemas(configuration.object)
  const localization = contentI18n(schema)
  const locale = localization?.locales.some(
    (item) => item.code === input.locale,
  )
    ? input.locale
    : localization?.default
  const root = collectionDirectoryPath(schema)
  const state = parseCursor(input.cursor, root)
  const selected = new Set(input.selectedValues)
  const view = isRecord(schema.view) ? schema.view : {}
  const node =
    isRecord(view.node) && typeof view.node.filename === 'string'
      ? view.node.filename
      : undefined
  // The default value is a path: resolve selected labels directly in their cached
  // parent directories instead of scanning the whole collection on every render.
  const selectedPaths = selected.size > 0 && input.valueTemplate === '{path}'
  const direct = !localization && selectedPaths
  if (direct && !input.cursor) {
    state.directories = [
      ...new Set(
        input.selectedValues
          .filter(
            (path) =>
              normalizeGitPath(path) === path &&
              (!root || path.startsWith(`${root}/`)),
          )
          .map((path) => path.split('/').slice(0, -1).join('/')),
      ),
    ]
    if (schema.subfolders === false)
      state.directories = state.directories.filter(
        (path) =>
          path === root ||
          Boolean(node && path.split('/').slice(0, -1).join('/') === root),
      )
  }
  const extension = typeof schema.extension === 'string' ? schema.extension : ''
  const excluded = new Set(Array.isArray(schema.exclude) ? schema.exclude : [])
  const format =
    typeof schema.format === 'string' &&
    contentFormats.has(schema.format as ContentFormat)
      ? (schema.format as ContentFormat)
      : undefined
  const primary = getContentPrimaryField(schema)
  const fieldDefinitions = Array.isArray(schema.fields) ? schema.fields : []
  const query = input.query.toLowerCase()
  const options: Array<{ value: string; label: string }> = []
  let visited = 0
  while (
    state.directories.length &&
    visited++ < MAX_DIRECTORIES &&
    options.length < MAX_OPTIONS
  ) {
    const directory = state.directories[0]
    const result = await localizedDirectory(
      input.database,
      {
        api,
        owner: input.owner,
        repo: input.repo,
        branch: input.branch,
        path: directory,
        repositoryId: configuration.repositoryId,
        context: 'collection',
        enabled: true,
        ...(!direct && node && schema.subfolders === false
          ? { nodeFilename: node }
          : {}),
      },
      schema,
      locale,
    )
    // Node enrichment includes immediate children's node files. When traversing
    // recursively, those are visited in their own directory and must not repeat.
    const entries = result.entries.filter(
      (entry) =>
        !excluded.has(entry.name) &&
        !(
          entry.type === 'file' &&
          localization?.scheme === 'files' &&
          excluded.has(
            canonicalEntryPath(schema, entry.path).split('/').at(-1)!,
          )
        ) &&
        (direct ||
          schema.subfolders === false ||
          (entry.type === 'file' && localization?.scheme === 'files'
            ? canonicalEntryPath(schema, entry.path)
            : entry.path
          )
            .split('/')
            .slice(0, -1)
            .join('/') === directory),
    )
    let index = state.offset
    for (; index < entries.length && options.length < MAX_OPTIONS; index++) {
      const entry = entries[index]
      if (entry.type === 'dir') {
        if (!direct && schema.subfolders !== false)
          state.directories.push(entry.path)
        continue
      }
      if (selectedPaths && !selected.has(entry.path)) continue
      if (
        direct &&
        schema.subfolders === false &&
        directory !== root &&
        entry.name !== node
      )
        continue
      if (
        entry.name === '.gitkeep' ||
        (extension && !entry.path.endsWith(`.${extension}`))
      )
        continue
      let fields: JsonObject = {}
      if (format && entry.content !== null) {
        try {
          const content = parseContent(entry.content, {
            format,
            delimiters: schema.delimiters as FrontmatterDelimiters | undefined,
          })
          const document = format.startsWith('yaml')
            ? toJsonValue(content)
            : (content as JsonValue)
          const parsed =
            localization?.scheme === 'fields'
              ? projectLocale(schema, document, locale!)
              : document
          if (isRecord(parsed)) {
            fields = transformContentFields(
              fieldDefinitions,
              transformMediaFieldValues(
                fieldDefinitions,
                parsed,
                mediaSchemas,
                'read',
              ),
              'read',
              {
                initializeMissing: false,
                configuration: configuration.object,
              },
            ) as JsonObject
          }
        } catch {
          continue
        }
      }
      if (
        !('date' in fields) &&
        typeof schema.filename === 'string' &&
        schema.filename.startsWith('{year}-{month}-{day}')
      ) {
        const date = /^\d{4}-\d{2}-\d{2}/.exec(entry.name)?.[0]
        if (date) fields.date = date
      }
      const item = {
        locale,
        name: entry.name,
        path: entry.path,
        primary: primary ? access(fields, primary) : undefined,
      }
      const option = {
        value: interpolate(input.valueTemplate, item, fields),
        label: interpolate(input.labelTemplate, item, fields),
      }
      if (!option.value || (selected.size && !selected.has(option.value)))
        continue
      if (
        !selected.size &&
        query &&
        !input.searchFields.some((field) =>
          String(
            ['name', 'path', 'primary'].includes(field)
              ? (item[field as keyof typeof item] ?? '')
              : (access(fields, field.replace(/^fields\./, '')) ?? ''),
          )
            .toLowerCase()
            .includes(query),
        )
      )
        continue
      options.push(option)
    }
    if (index >= entries.length) {
      state.directories.shift()
      state.offset = 0
    } else state.offset = index
    if (
      selected.size &&
      [...selected].every((value) =>
        options.some((option) => option.value === value),
      )
    ) {
      state.directories = []
      break
    }
  }
  if (state.directories.length > 10000)
    throw new Error(
      'Reference collection has too many directories to browse. Narrow its configured path.',
    )
  return {
    options,
    ...(state.directories.length ? { cursor: JSON.stringify(state) } : {}),
  }
}
