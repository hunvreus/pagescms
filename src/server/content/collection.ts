import { collectionPresentation } from '#/shared/collection-presentation'
import { isRecord, toJsonValue } from '#/shared/json'
import { configurationStoreFor } from '#/server/cache/configuration-access'
import { canonicalEntryPath } from '#/lib/i18n'
import { projectLocale } from '#/lib/i18n-values'
import { localizedDirectory } from './localized-directory'
import { getContentPrimaryField } from '#/lib/content-filename'
import { allowsCustomCommitMessage } from '#/lib/commit-message'
import {
  collectionDirectoryPath,
  configuredMediaSchemas,
  findContentSchema,
} from '#/shared/configuration-content'
import { contentFormats, parseContent } from '#/shared/content-serialization'
import { transformContentFields } from '#/lib/content-field-values'
import {
  collectionListFields,
  collectionViewModel,
} from '#/features/collections/collection-model'

import { admittedConfigurationScope } from '#/server/cache/configuration'

import type {
  ContentFormat,
  FrontmatterDelimiters,
} from '#/shared/content-serialization'
import type { JsonValue } from '#/shared/json'
import type { Database } from '#/server/db/client'
import type { RepositoryUser } from '../repository/repositories'
import type { RepositoryAccessService } from '#/server/access/repository'

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
      locale?: string
      fields: JsonValue
    }

function contentFormat(value: unknown): ContentFormat | undefined {
  return typeof value === 'string' && contentFormats.has(value as ContentFormat)
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

function dateFromFilename(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  return match ? `${match[1]}-${match[2]}-${match[3]}` : undefined
}

export async function loadCollection({
  database,
  repositoryAccess,
  user,
  owner,
  repo,
  branch,
  repoId,
  name,
  path,
  locale,
  forceRefresh,
}: {
  database: Database
  repositoryAccess: RepositoryAccessService
  user: RepositoryUser
  owner: string
  repo: string
  branch: string
  repoId?: string
  name: string
  path?: string
  locale?: string
  forceRefresh?: boolean
}) {
  const {
    api,
    repository,
    identity: admittedIdentity,
  } = await repositoryAccess.resolve(user, owner, repo, branch, repoId)
  const configuration = await configurationStoreFor(
    repositoryAccess,
    database,
  ).get(
    api,
    owner,
    repo,
    branch,
    repository ? String(repository.id) : undefined,
    repository && admittedConfigurationScope(admittedIdentity),
  )
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
  const presentation = collectionPresentation(configuration.object, schema)
  const localization = presentation.i18n ?? undefined
  const selectedLocale = locale ?? localization?.default
  const directoryResult = await localizedDirectory(
    database,
    {
      api,
      owner,
      repo,
      branch,
      path: directory,
      repositoryId: configuration.repositoryId,
      context: 'collection',
      enabled: true,
      forceRefresh,
      nodeFilename,
    },
    schema,
    selectedLocale,
  )
  let entries = directoryResult.entries.map((entry) => {
    const canonical =
      entry.type === 'file' && localization?.scheme === 'files'
        ? canonicalEntryPath(schema, entry.path)
        : entry.path
    const separator = canonical.lastIndexOf('/')
    const parentPath = separator === -1 ? '' : canonical.slice(0, separator)
    return {
      ...entry,
      parentPath,
      canonicalName: canonical.slice(canonical.lastIndexOf('/') + 1),
      isNode:
        entry.type === 'file' &&
        canonical.slice(canonical.lastIndexOf('/') + 1) === nodeFilename &&
        parentPath !== directory,
    }
  })
  if (nodeFilename) {
    entries = entries.filter(
      (entry) =>
        entry.isNode ||
        entry.parentPath === schema.path ||
        entry.canonicalName !== nodeFilename,
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
  const fieldDefinitions = Array.isArray(schema.fields) ? schema.fields : []
  const contentDelimiters = delimiters(schema.delimiters)
  const model = collectionViewModel({
    fields: schema.fields,
    filename: schema.filename,
    view: schema.view,
  })
  const errors: string[] = []
  const parseErrorPaths: string[] = []
  const contents: CollectionEntry[] = []

  for (const entry of entries) {
    if (entry.name === '.gitkeep') continue
    if (excluded.has(entry.name) || excluded.has(entry.canonicalName)) continue
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
    if (format && fieldDefinitions.length && entry.content !== null) {
      try {
        const content = parseContent(entry.content, {
          format,
          delimiters: contentDelimiters,
        })
        const document = format.startsWith('yaml')
          ? toJsonValue(content)
          : (content as JsonValue)
        const parsed =
          localization?.scheme === 'fields'
            ? projectLocale(schema, document, selectedLocale!)
            : document
        if (
          isRecord(parsed) &&
          !('date' in parsed) &&
          typeof schema.filename === 'string' &&
          schema.filename.startsWith('{year}-{month}-{day}')
        ) {
          const date = dateFromFilename(entry.name)
          if (date) parsed.date = date
        }
        const transformed = isRecord(parsed)
          ? transformContentFields(fieldDefinitions, parsed, 'read', {
              initializeMissing: false,
              customOnly: true,
              configuration: configuration.object,
            })
          : parsed
        fields = collectionListFields(transformed, model) as JsonValue
      } catch (error) {
        parseErrorPaths.push(entry.path)
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
      ...(localization?.scheme === 'files' ? { locale: selectedLocale } : {}),
      fields,
    })
  }

  return {
    collection: {
      ...presentation,
      locale: selectedLocale ?? null,
      localized: schema.localized === true,
      allowCustomMessage: allowsCustomCommitMessage(
        configuration.object,
        schema,
      ),
      primaryField: getContentPrimaryField(schema),
      path: directory,
      extension: typeof schema.extension === 'string' ? schema.extension : null,
      filename: typeof schema.filename === 'string' ? schema.filename : null,
      fields: fieldDefinitions as JsonValue,
      list: schema.list ? (schema.list as JsonValue) : null,
      filenameField:
        schema.filenameField === true || schema.filenameField === 'create',
      view: (typeof schema.view === 'object' && schema.view !== null
        ? schema.view
        : {}) as JsonValue,
    },
    contents,
    errors,
    parseErrorPaths,
    media: configuredMediaSchemas(configuration.object),
  }
}
