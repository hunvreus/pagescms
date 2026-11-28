import {
  decodeBase64Utf8 as decodeBase64,
  encodeBase64Utf8 as encodeBase64,
} from '#/lib/base64'
import { configurationStoreFor } from '#/server/cache/configuration-access'
import { UserError } from '#/server/http'
import {
  canonicalEntryPath,
  contentI18n,
  localizedPath,
  localeDirectory,
  parseLocalizedPath,
} from '#/lib/i18n'
import {
  projectLocale,
  transformLocalizedDocument,
  preserveUnmanagedDocument,
} from '#/lib/i18n-values'
import {
  localizedContentIssues,
  contentValidationIssues,
} from '#/lib/content-validation'
import {
  allowsCustomCommitMessage,
  buildCommitTokens,
  resolveCommitIdentity,
  resolveCommitMessage,
} from '#/lib/commit-message'
import { schemaActions } from '#/lib/actions'
import {
  filenamePathIssue,
  generateContentFilename,
  getContentPrimaryField,
} from '#/lib/content-filename'
import {
  collectionDirectoryPath,
  configuredMediaSchemas,
  findContentSchema,
} from '#/shared/configuration-content'
import {
  contentFormats,
  parseContent,
  serializeContent,
} from '#/shared/content-serialization'
import {
  isContentOperationAllowed,
  resolveContentOperations,
} from '#/lib/content-operations'
import { getConfigurationNavigationGroupTrail } from '#/shared/configuration-navigation'
import {
  initializeStructuredContent,
  sanitizeStructuredContent,
} from '#/lib/field-values'
import { fieldValidationError } from '#/shared/field-validation-error'
import { getFileExtension } from '#/lib/file-types'
import {
  transformContentFields,
  projectContentFields,
} from '#/lib/content-field-values'
import {
  getGitFileName,
  getGitParentPath,
  normalizeGitPath,
} from '#/shared/git-path'
import { toJsonObject, toJsonValue } from '#/shared/json'
import type { JsonValue } from '#/shared/json'
import { transformMediaFieldValues } from '#/lib/media-field-values'

import { admittedConfigurationScope } from '#/server/cache/configuration'
import { withContentConflict } from './conflict'
import { updateRepositoryCacheAfterMutation } from '#/server/cache/repository'
import {
  RepositoryProviderError,
  isRepositoryProviderError,
} from '../repository/provider'

import type { CommitIdentity, CommitTemplates } from '#/lib/commit-message'
import type { ContentSchema } from '#/shared/configuration-content'
import type {
  ContentFormat,
  FrontmatterDelimiters,
} from '#/shared/content-serialization'
import type { Database } from '#/server/db/client'
import type { RepositoryUser } from '../repository/repositories'
import type { RepositoryAccessService } from '#/server/access/repository'

async function loadContext(
  database: Database,
  repositoryAccess: RepositoryAccessService,
  user: RepositoryUser,
  owner: string,
  repo: string,
  branch: string,
  name: string,
  path: string,
  repoId?: string,
) {
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
  if (!configuration) throw new UserError('Repository configuration not found')
  const schema = findContentSchema(configuration.object, name)
  if (!schema) throw new UserError(`Content schema ${name} was not found`)
  return { api, configuration, schema, path: entryPath(schema, path) }
}

function entryPath(schema: ContentSchema, path: string) {
  const normalizedPath = normalizeGitPath(path)
  canonicalEntryPath(schema, normalizedPath)
  if (
    typeof schema.extension === 'string' &&
    getFileExtension(normalizedPath) !== schema.extension
  ) {
    throw new UserError('Entry extension does not match its content schema')
  }
  return normalizedPath
}

function schemaCommitOptions(schema: Record<string, unknown>): {
  templates: CommitTemplates | undefined
  identity: CommitIdentity | undefined
} {
  const commit =
    typeof schema.commit === 'object' && schema.commit !== null
      ? (schema.commit as Record<string, unknown>)
      : {}
  const identity =
    commit.identity === 'app' || commit.identity === 'user'
      ? commit.identity
      : undefined
  return {
    templates:
      typeof commit.templates === 'object' && commit.templates !== null
        ? commit.templates
        : undefined,
    identity,
  }
}

function entrySchemaMetadata(
  configuration: Record<string, unknown>,
  schema: Record<string, unknown>,
  path: string,
) {
  const schemaName = typeof schema.name === 'string' ? schema.name : ''
  return {
    schemaName,
    i18n: contentI18n(schema) ?? null,
    localized: schema.localized === true,
    locale:
      parseLocalizedPath(schema, path)?.locale ??
      contentI18n(schema)?.default ??
      null,
    translations:
      contentI18n(schema)?.scheme === 'files'
        ? contentI18n(schema)!.locales.map((locale) => ({
            ...locale,
            path: localizedPath(
              schema,
              canonicalEntryPath(schema, path),
              locale.code,
            ),
          }))
        : [],
    allowCustomMessage: allowsCustomCommitMessage(configuration, schema),
    schemaType: typeof schema.type === 'string' ? schema.type : 'file',
    rootPath: normalizeGitPath(String(schema.path ?? '')),
    filename: getGitFileName(path),
    primaryField: getContentPrimaryField(schema),
    groupTrail: getConfigurationNavigationGroupTrail(configuration, schemaName),
  }
}

export async function loadRawEntry(input: {
  database: Database
  repositoryAccess: RepositoryAccessService
  user: RepositoryUser
  owner: string
  repo: string
  branch: string
  repoId?: string
  name: string
  path: string
}) {
  const context = await loadContext(
    input.database,
    input.repositoryAccess,
    input.user,
    input.owner,
    input.repo,
    input.branch,
    input.name,
    input.path,
    input.repoId,
  )
  try {
    const file = await context.api.getFile(
      input.owner,
      input.repo,
      context.path,
      input.branch,
    )
    return entryData(context, decodeBase64(file.content), file.sha)
  } catch (error) {
    if (
      !isRepositoryProviderError(error, 404) ||
      contentI18n(context.schema)?.scheme !== 'files' ||
      !isContentOperationAllowed('create', { schema: context.schema })
    )
      throw error
    if (
      context.schema.type === 'collection' &&
      !(await hasTranslationSibling(
        context,
        input.owner,
        input.repo,
        input.branch,
      ))
    )
      throw error
    const format = context.schema.format as ContentFormat
    const blank = contentFormats.has(format)
      ? serializeContent(context.schema.list ? [] : {}, {
          format,
          delimiters: context.schema.delimiters as
            FrontmatterDelimiters | undefined,
        })
      : ''
    return entryData(context, blank, null)
  }
}

async function hasTranslationSibling(
  context: Awaited<ReturnType<typeof loadContext>>,
  owner: string,
  repo: string,
  branch: string,
) {
  const config = contentI18n(context.schema)
  if (config?.scheme !== 'files') return false
  const canonical = canonicalEntryPath(context.schema, context.path)
  const paths = config.locales
    .map((locale) => localizedPath(context.schema, canonical, locale.code))
    .filter((path) => path !== context.path)
  if (!paths.length) return false
  const siblings = await context.api.getFiles(owner, repo, branch, paths, false)
  return siblings.some(
    (file) => file.type === 'file' && paths.includes(file.path),
  )
}

export async function loadEntryTranslations(
  input: Parameters<typeof loadRawEntry>[0] & {
    authorizeRead?: (path: string) => Promise<void>
  },
) {
  const context = await loadContext(
    input.database,
    input.repositoryAccess,
    input.user,
    input.owner,
    input.repo,
    input.branch,
    input.name,
    input.path,
    input.repoId,
  )
  const config = contentI18n(context.schema)
  if (config?.scheme !== 'files') return []
  const canonical = canonicalEntryPath(context.schema, context.path)
  const revision = await context.api.getRefSha(
    input.owner,
    input.repo,
    input.branch,
  )
  const locales = config.locales.map((locale) => ({
    ...locale,
    path: localizedPath(context.schema, canonical, locale.code),
  }))
  await Promise.all(locales.map(({ path }) => input.authorizeRead?.(path)))
  const files = await context.api.getFiles(
    input.owner,
    input.repo,
    revision,
    locales.map(({ path }) => path),
    false,
  )
  const byPath = new Map(
    files
      .filter((file) => file.type === 'file')
      .map((file) => [file.path, file]),
  )
  return locales.map((locale) => {
    const file = byPath.get(locale.path)
    return { ...locale, exists: Boolean(file), sha: file?.sha ?? null }
  })
}

function entryData<TSha extends string | null>(
  context: Awaited<ReturnType<typeof loadContext>>,
  source: string,
  sha: TSha,
) {
  const fields = Array.isArray(context.schema.fields)
    ? context.schema.fields
    : []
  const format =
    typeof context.schema.format === 'string' &&
    contentFormats.has(context.schema.format as ContentFormat)
      ? (context.schema.format as ContentFormat)
      : undefined
  const shared = {
    source,
    sha,
    path: context.path,
    label:
      typeof context.schema.label === 'string' && context.schema.label
        ? context.schema.label
        : context.schema.name,
    ...entrySchemaMetadata(
      context.configuration.object,
      context.schema,
      context.path,
    ),
    operations: resolveContentOperations({ schema: context.schema }),
    actionContextType:
      context.schema.type === 'collection'
        ? ('entry' as const)
        : ('file' as const),
    actions:
      context.schema.type === 'collection'
        ? schemaActions(context.schema, 'entry')
        : schemaActions(context.schema),
    media: configuredMediaSchemas(context.configuration.object),
  }
  if (fields.length && format) {
    return {
      ...shared,
      fields: fields as JsonValue,
      ...structuredContent(
        parseContent(source, {
          format,
          delimiters: context.schema.delimiters as
            FrontmatterDelimiters | undefined,
        }),
        Boolean(context.schema.list),
        fields,
        shared.media,
        context.configuration.object,
        context.schema,
      ),
      ...(context.schema.list
        ? { list: context.schema.list as JsonValue }
        : {}),
    }
  }
  return {
    ...shared,
    mode: 'raw' as const,
  }
}

function structuredContent(
  content: unknown,
  list: boolean,
  fields: unknown[],
  media: ReturnType<typeof configuredMediaSchemas>,
  configuration: ReturnType<typeof toJsonObject>,
  schema?: ContentSchema,
) {
  const value = toJsonValue(content)
  if (schema && contentI18n(schema)?.scheme === 'fields') {
    const transformed = transformLocalizedDocument(
      schema,
      value as ReturnType<typeof toJsonObject>,
      (nested, data) =>
        transformContentFields(
          nested,
          transformMediaFieldValues(nested, data, media, 'read'),
          'read',
          { configuration, initializeMissing: false },
        ),
    )
    if (schema.list && !schema.localized)
      return { mode: 'structured-list' as const, content: transformed }
    return { mode: 'structured' as const, content: transformed }
  }
  if (list) {
    if (!Array.isArray(value)) {
      throw new UserError('Expected a list at the root of this content file')
    }
    return {
      mode: 'structured-list' as const,
      content: transformContentFields(
        fields,
        transformMediaFieldValues(fields, value, media, 'read'),
        'read',
        { configuration },
      ),
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected a JSON object')
  return {
    mode: 'structured' as const,
    content: transformContentFields(
      fields,
      transformMediaFieldValues(fields, value, media, 'read'),
      'read',
      { configuration },
    ),
  }
}

export async function loadEntryHistory(input: {
  database: Database
  repositoryAccess: RepositoryAccessService
  user: RepositoryUser
  owner: string
  repo: string
  branch: string
  repoId?: string
  name: string
  path: string
  page?: number
}) {
  const context = await loadContext(
    input.database,
    input.repositoryAccess,
    input.user,
    input.owner,
    input.repo,
    input.branch,
    input.name,
    input.path,
    input.repoId,
  )
  return context.api.listFileCommits(
    input.owner,
    input.repo,
    input.branch,
    context.path,
    input.page,
  )
}

export async function loadFixedFile(
  input: Omit<Parameters<typeof loadRawEntry>[0], 'path'> & { locale?: string },
) {
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
  if (!configuration) throw new UserError('Repository configuration not found')
  const schema = findContentSchema(configuration.object, input.name)
  if (!schema || schema.type !== 'file') {
    throw new UserError(`File ${input.name} was not found`)
  }
  const selectedPath = localizedPath(
    schema,
    schema.path,
    input.locale ?? contentI18n(schema)?.default ?? '',
  )
  try {
    return await loadRawEntry({ ...input, path: selectedPath })
  } catch (error) {
    if (!isRepositoryProviderError(error, 404)) throw error
  }
  if (!isContentOperationAllowed('create', { schema })) {
    throw new UserError('This file does not exist and creating it is disabled')
  }
  const fields = Array.isArray(schema.fields) ? schema.fields : []
  const format =
    typeof schema.format === 'string' &&
    contentFormats.has(schema.format as ContentFormat)
      ? (schema.format as ContentFormat)
      : undefined
  const shared = {
    source: '',
    sha: null,
    path: selectedPath,
    label:
      typeof schema.label === 'string' && schema.label
        ? schema.label
        : schema.name,
    ...entrySchemaMetadata(configuration.object, schema, selectedPath),
    operations: resolveContentOperations({ schema }),
    actionContextType: 'file' as const,
    actions: schemaActions(schema),
    media: configuredMediaSchemas(configuration.object),
  }
  if (fields.length && format) {
    if (
      contentI18n(schema)?.scheme === 'fields' &&
      (!schema.list || schema.localized)
    )
      return {
        ...shared,
        mode: 'structured' as const,
        fields: fields as JsonValue,
        content: schema.localized ? {} : initializeStructuredContent(fields),
        ...(schema.list ? { list: schema.list as JsonValue } : {}),
      }
    if (schema.list) {
      return {
        ...shared,
        mode: 'structured-list' as const,
        fields: fields as JsonValue,
        content: [],
        list: schema.list as JsonValue,
      }
    }
    return {
      ...shared,
      mode: 'structured' as const,
      fields: fields as JsonValue,
      content: initializeStructuredContent(fields),
    }
  }
  return { ...shared, mode: 'raw' as const }
}

export async function saveStructuredEntry(
  input: Omit<Parameters<typeof saveRawEntry>[0], 'source'> & {
    content: unknown
  },
) {
  const context = await loadContext(
    input.database,
    input.repositoryAccess,
    input.user,
    input.owner,
    input.repo,
    input.branch,
    input.name,
    input.path,
    input.repoId,
  )
  return saveStructuredWithContext(input, context)
}

async function saveStructuredWithContext(
  input: Parameters<typeof saveStructuredEntry>[0],
  context: Awaited<ReturnType<typeof loadContext>>,
  newGroup = false,
) {
  const value = toJsonValue(input.content)
  const fields = Array.isArray(context.schema.fields)
    ? context.schema.fields
    : []
  const content =
    context.schema.list && context.schema.localized !== true
      ? Array.isArray(value)
        ? value
        : undefined
      : Array.isArray(value)
        ? undefined
        : value && typeof value === 'object'
          ? value
          : toJsonObject(value)
  if (!content) {
    throw new UserError(
      context.schema.list
        ? 'Content must be a list'
        : 'Content must be an object',
    )
  }
  if (contentI18n(context.schema)?.scheme === 'fields') {
    const document = content
    const media = configuredMediaSchemas(context.configuration.object)
    const errors = localizedContentIssues(context.schema, document, media)
    if (errors.length) throw fieldValidationError(errors)
    const persisted = transformLocalizedDocument(
      context.schema,
      document,
      (nested, data) =>
        transformContentFields(
          nested,
          transformMediaFieldValues(nested, data, media, 'write'),
          'write',
          { configuration: context.configuration.object },
        ),
    )
    let documentForStorage = persisted
    let originalSource: string | undefined
    if (input.sha) {
      const existing = await context.api.getFile(
        input.owner,
        input.repo,
        context.path,
        input.branch,
      )
      if (existing.sha !== input.sha)
        await withContentConflict(async () => {
          throw new RepositoryProviderError(
            'The file changed; reload before saving this draft',
            409,
          )
        })
      originalSource = decodeBase64(existing.content)
      const original = toJsonValue(
        parseContent(originalSource, {
          format: context.schema.format as ContentFormat,
          delimiters: context.schema.delimiters as
            FrontmatterDelimiters | undefined,
        }),
      )
      documentForStorage = preserveUnmanagedDocument(
        context.schema,
        original,
        persisted,
      ) as typeof persisted
    }
    const source = serializeContent(documentForStorage, {
      originalSource,
      format: context.schema.format as ContentFormat,
      delimiters: context.schema.delimiters as
        FrontmatterDelimiters | undefined,
    })
    return writeEntry({ ...input, source }, context, newGroup)
  }
  const managedContent = projectContentFields(fields, content)
  // Validate submitted cardinality before output cleanup removes empty arrays.
  const errors = contentValidationIssues(
    fields,
    managedContent,
    configuredMediaSchemas(context.configuration.object),
    context.schema.list,
  )
  if (errors.length) throw fieldValidationError(errors)
  const sanitizedValue = sanitizeStructuredContent(managedContent)
  const sanitizedContent = Array.isArray(content)
    ? Array.isArray(sanitizedValue)
      ? sanitizedValue
      : []
    : toJsonObject(sanitizedValue)
  if (
    typeof context.schema.format !== 'string' ||
    !contentFormats.has(context.schema.format as ContentFormat)
  ) {
    throw new UserError('This content schema does not use a structured format')
  }
  const settings = toJsonObject(context.configuration.object.settings ?? {})
  const contentSettings = toJsonObject(settings.content ?? {})
  const merge =
    contentSettings.merge === true &&
    Boolean(input.sha) &&
    !Array.isArray(sanitizedContent)
  const persistedContent = transformContentFields(
    fields,
    transformMediaFieldValues(
      fields,
      merge ? managedContent : sanitizedContent,
      configuredMediaSchemas(context.configuration.object),
      'write',
    ),
    'write',
    { configuration: context.configuration.object },
  )
  let finalContent = persistedContent
  let originalSource: string | undefined
  if (
    merge ||
    (input.sha && ['toml', 'toml-frontmatter'].includes(context.schema.format))
  ) {
    const existing = await context.api.getFile(
      input.owner,
      input.repo,
      context.path,
      input.branch,
    )
    originalSource = decodeBase64(existing.content)
  }
  if (
    merge &&
    originalSource !== undefined &&
    !Array.isArray(persistedContent)
  ) {
    const parsed = parseContent(originalSource, {
      format: context.schema.format as ContentFormat,
      delimiters: context.schema.delimiters as
        FrontmatterDelimiters | undefined,
    })
    finalContent = preserveUnmanagedDocument(
      context.schema,
      toJsonObject(parsed),
      persistedContent,
    ) as typeof persistedContent
  }
  const source = serializeContent(finalContent, {
    originalSource,
    format: context.schema.format as ContentFormat,
    delimiters: context.schema.delimiters as FrontmatterDelimiters | undefined,
  })
  return writeEntry({ ...input, source }, context, newGroup)
}

export async function saveRawEntry(input: {
  database: Database
  repositoryAccess: RepositoryAccessService
  user: RepositoryUser & { name: string }
  owner: string
  repo: string
  branch: string
  repoId?: string
  name: string
  path: string
  source: string
  sha?: string | null
  message?: string
  authorizeWrite?: (path: string) => Promise<void>
}) {
  if (new TextEncoder().encode(input.source).byteLength > 5_000_000)
    throw new UserError('Entry exceeds the 5 MB limit')
  const context = await loadContext(
    input.database,
    input.repositoryAccess,
    input.user,
    input.owner,
    input.repo,
    input.branch,
    input.name,
    input.path,
    input.repoId,
  )
  return writeEntry(input, context)
}

async function writeEntry(
  input: Parameters<typeof saveRawEntry>[0],
  context: Awaited<ReturnType<typeof loadContext>>,
  newGroup = false,
) {
  if (!input.sha) {
    if (!isContentOperationAllowed('create', { schema: context.schema }))
      throw new UserError('Creating this content is disabled')
    if (
      !newGroup &&
      context.schema.type === 'collection' &&
      contentI18n(context.schema)?.scheme === 'files' &&
      !(await hasTranslationSibling(
        context,
        input.owner,
        input.repo,
        input.branch,
      ))
    )
      throw new UserError(
        'Use the collection creation flow to create a new translation group',
      )
  }
  if (new TextEncoder().encode(input.source).byteLength > 5_000_000)
    throw new UserError('Entry exceeds the 5 MB limit')
  if (
    typeof context.schema.format === 'string' &&
    contentFormats.has(context.schema.format as ContentFormat)
  ) {
    parseContent(input.source, {
      format: context.schema.format as ContentFormat,
      delimiters: context.schema.delimiters as
        FrontmatterDelimiters | undefined,
    })
  }
  const commit = schemaCommitOptions(context.schema)
  const action = input.sha ? 'update' : 'create'
  const identity = resolveCommitIdentity({
    configuration: context.configuration.object,
    identityOverride: commit.identity,
  })
  const message =
    allowsCustomCommitMessage(context.configuration.object, context.schema) &&
    input.message?.trim()
      ? input.message.trim()
      : resolveCommitMessage({
          configuration: context.configuration.object,
          templatesOverride: commit.templates,
          action,
          tokens: buildCommitTokens({
            action,
            owner: input.owner,
            repo: input.repo,
            branch: input.branch,
            path: context.path,
            contentName: input.name,
            user: input.user.email,
            userName: input.user.name,
            userEmail: input.user.email,
          }),
        })
  await input.authorizeWrite?.(context.path)
  const entry = entryData(context, input.source, null)
  const write = () =>
    context.api.putFile({
      owner: input.owner,
      repo: input.repo,
      branch: input.branch,
      path: context.path,
      content: encodeBase64(input.source),
      message,
      ...(input.sha ? { sha: input.sha } : {}),
      ...(identity === 'user'
        ? {
            committer: {
              name: input.user.name || input.user.email,
              email: input.user.email,
            },
          }
        : {}),
    })
  const result = await (input.sha || context.schema.type === 'file'
    ? withContentConflict(write)
    : write())
  await updateRepositoryCacheAfterMutation(
    input.database,
    context.api,
    input.owner,
    input.repo,
    input.branch,
    result,
    [{ path: context.path, removed: false }],
    [
      {
        path: context.path,
        name: context.path.slice(context.path.lastIndexOf('/') + 1),
        type: 'file',
        sha: result.sha,
        content: input.source,
        size: new TextEncoder().encode(input.source).byteLength,
        downloadUrl: null,
      },
    ],
    context.configuration.repositoryId,
  )
  return { ...result, entry: { ...entry, sha: result.sha } }
}

function manualFilename(value: string) {
  const filename = value.trim()
  if (filenamePathIssue(filename, false))
    throw new UserError('Enter a valid filename without a folder path')
  return filename
}

export async function createStructuredEntry(
  input: Omit<Parameters<typeof saveStructuredEntry>[0], 'path' | 'sha'> & {
    parent?: string
    filename?: string
    locale?: string
  },
) {
  const content = toJsonValue(input.content)
  const context = await loadCollectionCreationContext(input)
  const { schema, parent } = context
  let filename: string
  if (input.filename !== undefined) {
    if (schema.filenameField !== true && schema.filenameField !== 'create') {
      throw new UserError('Custom filenames are disabled for this collection')
    }
    filename = manualFilename(input.filename)
  } else {
    if (typeof schema.filename !== 'string') {
      throw new UserError('Collection filename template is missing')
    }
    filename = generateContentFilename(
      schema.filename,
      schema,
      Array.isArray(content)
        ? {}
        : toJsonObject(
            contentI18n(schema)?.scheme === 'fields'
              ? projectLocale(
                  schema,
                  content,
                  input.locale ?? contentI18n(schema)!.default,
                )
              : content,
          ),
    )
  }
  const path = localizedPath(
    schema,
    normalizeGitPath(parent ? `${parent}/${filename}` : filename),
    input.locale ?? contentI18n(schema)?.default ?? '',
  )
  return {
    ...(await saveStructuredWithContext(
      { ...input, content, path },
      { ...context, path: entryPath(schema, path) },
      true,
    )),
    path,
  }
}

async function loadCollectionCreationContext(input: {
  database: Database
  repositoryAccess: RepositoryAccessService
  user: RepositoryUser
  owner: string
  repo: string
  branch: string
  repoId?: string
  name: string
  parent?: string
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
  if (!configuration) throw new UserError('Repository configuration not found')
  const schema = findContentSchema(configuration.object, input.name)
  if (!schema || schema.type !== 'collection') {
    throw new UserError(`Collection ${input.name} was not found`)
  }
  if (!isContentOperationAllowed('create', { schema })) {
    throw new UserError('Creating entries is disabled for this collection')
  }
  return {
    api,
    configuration,
    schema,
    parent: collectionDirectoryPath(schema, input.parent),
  }
}

export async function createRawEntry(
  input: Omit<Parameters<typeof saveRawEntry>[0], 'path' | 'sha'> & {
    parent?: string
    filename?: string
    locale?: string
  },
) {
  const context = await loadCollectionCreationContext(input)
  let filename: string
  if (input.filename !== undefined) {
    if (
      context.schema.filenameField !== true &&
      context.schema.filenameField !== 'create'
    ) {
      throw new UserError('Custom filenames are disabled for this collection')
    }
    filename = manualFilename(input.filename)
  } else {
    if (typeof context.schema.filename !== 'string') {
      throw new UserError('Collection filename template is missing')
    }
    filename = generateContentFilename(
      context.schema.filename,
      context.schema,
      {},
    )
  }
  const path = localizedPath(
    context.schema,
    normalizeGitPath(
      context.parent ? `${context.parent}/${filename}` : filename,
    ),
    input.locale ?? contentI18n(context.schema)?.default ?? '',
  )
  return {
    ...(await writeEntry(
      { ...input, path },
      { ...context, path: entryPath(context.schema, path) },
      true,
    )),
    path,
  }
}

export async function createContentFolder(
  input: Omit<Parameters<typeof saveRawEntry>[0], 'path' | 'source' | 'sha'> & {
    parent: string
    folder: string
    locale?: string
  },
) {
  const context = await loadCollectionCreationContext(input)
  if (input.folder && context.schema.subfolders === false) {
    throw new UserError('This collection does not allow subfolders')
  }
  const folder = normalizeGitPath(input.folder)
  if (folder.split('/').some((part) => part === '.gitkeep')) {
    throw new UserError('Folder name is invalid')
  }
  if (!folder) {
    throw new UserError('Folder name is invalid')
  }
  const directory = collectionDirectoryPath(
    context.schema,
    `${context.parent}/${folder}`,
  )
  const locale = input.locale ?? contentI18n(context.schema)?.default ?? ''
  // Folder creation must obey the same reserved-name rules as entry creation.
  localizedPath(context.schema, `${directory}/__entry__.md`, locale)
  const physical = localeDirectory(context.schema, directory, locale)
  const path = normalizeGitPath(`${physical}/.gitkeep`)
  await input.authorizeWrite?.(path)
  const commit = schemaCommitOptions(context.schema)
  const identity = resolveCommitIdentity({
    configuration: context.configuration.object,
    identityOverride: commit.identity,
  })
  const message = resolveCommitMessage({
    configuration: context.configuration.object,
    templatesOverride: commit.templates,
    action: 'create',
    tokens: buildCommitTokens({
      action: 'create',
      owner: input.owner,
      repo: input.repo,
      branch: input.branch,
      path,
      contentName: input.name,
      user: input.user.email,
      userName: input.user.name,
      userEmail: input.user.email,
    }),
  })
  const result = await context.api.putFile({
    owner: input.owner,
    repo: input.repo,
    branch: input.branch,
    path,
    content: encodeBase64(''),
    message,
    ...(identity === 'user'
      ? {
          committer: {
            name: input.user.name || input.user.email,
            email: input.user.email,
          },
        }
      : {}),
  })
  await updateRepositoryCacheAfterMutation(
    input.database,
    context.api,
    input.owner,
    input.repo,
    input.branch,
    result,
    [{ path, removed: false }],
    [
      {
        path,
        name: '.gitkeep',
        type: 'file',
        sha: result.sha,
        content: '',
        size: 0,
        downloadUrl: null,
      },
    ],
    context.configuration.repositoryId,
  )
  return { ...result, path: directory }
}

export async function deleteContentEntry(input: {
  database: Database
  repositoryAccess: RepositoryAccessService
  user: RepositoryUser & { name: string }
  owner: string
  repo: string
  branch: string
  repoId?: string
  name: string
  path: string
  sha: string
}) {
  const context = await loadContext(
    input.database,
    input.repositoryAccess,
    input.user,
    input.owner,
    input.repo,
    input.branch,
    input.name,
    input.path,
    input.repoId,
  )
  if (!isContentOperationAllowed('delete', { schema: context.schema })) {
    throw new UserError('Deleting this content is disabled')
  }
  const commit = schemaCommitOptions(context.schema)
  const identity = resolveCommitIdentity({
    configuration: context.configuration.object,
    identityOverride: commit.identity,
  })
  const message = resolveCommitMessage({
    configuration: context.configuration.object,
    templatesOverride: commit.templates,
    action: 'delete',
    tokens: buildCommitTokens({
      action: 'delete',
      owner: input.owner,
      repo: input.repo,
      branch: input.branch,
      path: context.path,
      contentName: input.name,
      user: input.user.email,
      userName: input.user.name,
      userEmail: input.user.email,
    }),
  })
  const result = await context.api.deleteFile({
    owner: input.owner,
    repo: input.repo,
    branch: input.branch,
    path: context.path,
    sha: input.sha,
    message,
    ...(identity === 'user'
      ? {
          committer: {
            name: input.user.name || input.user.email,
            email: input.user.email,
          },
        }
      : {}),
  })
  await updateRepositoryCacheAfterMutation(
    input.database,
    context.api,
    input.owner,
    input.repo,
    input.branch,
    result,
    [{ path: context.path, removed: true }],
    undefined,
    context.configuration.repositoryId,
  )
  return result
}

export async function planContentRename(
  input: Parameters<typeof deleteContentEntry>[0] & {
    filename?: string
    locale?: string
    newPath?: string
  },
) {
  const context = await loadContext(
    input.database,
    input.repositoryAccess,
    input.user,
    input.owner,
    input.repo,
    input.branch,
    input.name,
    input.path,
    input.repoId,
  )
  return planRename(input, context)
}

async function planRename(
  input: Parameters<typeof planContentRename>[0],
  context: Awaited<ReturnType<typeof loadContext>>,
) {
  if (
    context.schema.type !== 'collection' ||
    !isContentOperationAllowed('rename', { schema: context.schema })
  )
    throw new UserError('Renaming this content is disabled')
  const parent = getGitParentPath(context.path)
  const filename =
    input.filename === undefined ? undefined : manualFilename(input.filename)
  const destination = entryPath(
    context.schema,
    input.newPath ?? `${parent}/${filename ?? ''}`,
  )
  const config = contentI18n(context.schema)
  if (config?.scheme !== 'files')
    return [
      {
        path: context.path,
        newPath: destination,
        sha: input.sha,
        revision: undefined as string | undefined,
      },
    ]
  if (
    parseLocalizedPath(context.schema, context.path)?.locale !==
    parseLocalizedPath(context.schema, destination)?.locale
  )
    throw new UserError(
      'Keep the current language suffix or folder when renaming a translation',
    )
  const source = canonicalEntryPath(context.schema, context.path)
  const target = canonicalEntryPath(context.schema, destination)
  const revision = await context.api.getRefSha(
    input.owner,
    input.repo,
    input.branch,
  )
  const moves: {
    path: string
    newPath: string
    sha: string
    revision?: string
  }[] = []
  for (const locale of config.locales) {
    const path = localizedPath(context.schema, source, locale.code)
    const newPath = localizedPath(context.schema, target, locale.code)
    try {
      const file = await context.api.getFile(
        input.owner,
        input.repo,
        path,
        revision,
      )
      moves.push({ path, newPath, sha: file.sha, revision })
    } catch (error) {
      if (!isRepositoryProviderError(error, 404)) throw error
    }
  }
  if (
    !moves.some((move) => move.path === context.path && move.sha === input.sha)
  )
    throw new UserError('The entry changed; refresh before renaming')
  return moves
}

export async function renameContentEntry(
  input: Parameters<typeof deleteContentEntry>[0] & {
    filename: string
    confirmedMoves?: {
      path: string
      newPath: string
      sha: string
      revision?: string
    }[]
    authorizeMove?: (path: string, newPath: string) => Promise<void>
  },
) {
  const filename = manualFilename(input.filename)
  const path = normalizeGitPath(input.path)
  const separator = path.lastIndexOf('/')
  const parent = separator === -1 ? '' : path.slice(0, separator)
  const newPath = normalizeGitPath(parent ? `${parent}/${filename}` : filename)
  return moveContentEntry({ ...input, newPath })
}

export async function moveContentEntry(
  input: Parameters<typeof deleteContentEntry>[0] & {
    newPath: string
    confirmedMoves?: {
      path: string
      newPath: string
      sha: string
      revision?: string
    }[]
    authorizeMove?: (path: string, newPath: string) => Promise<void>
  },
) {
  const context = await loadContext(
    input.database,
    input.repositoryAccess,
    input.user,
    input.owner,
    input.repo,
    input.branch,
    input.name,
    input.path,
    input.repoId,
  )
  if (
    context.schema.type !== 'collection' ||
    !isContentOperationAllowed('rename', { schema: context.schema })
  ) {
    throw new UserError('Renaming this content is disabled')
  }
  const moves = await planRename(input, context)
  for (const move of moves) await input.authorizeMove?.(move.path, move.newPath)
  if (
    contentI18n(context.schema)?.scheme === 'files' &&
    (!input.confirmedMoves ||
      moves.length !== input.confirmedMoves.length ||
      moves.some((move, index) => {
        const confirmed = input.confirmedMoves![index]
        return (
          move.path !== confirmed.path ||
          move.newPath !== confirmed.newPath ||
          move.sha !== confirmed.sha ||
          move.revision !== confirmed.revision
        )
      }))
  )
    throw new UserError(
      'The branch changed. Review and confirm the rename again.',
    )
  const newPath = entryPath(context.schema, input.newPath)
  if (newPath === context.path) throw new UserError('The path has not changed')
  const destinationExists = await context.api
    .getFile(input.owner, input.repo, newPath, input.branch)
    .then(
      () => true,
      (error: unknown) => {
        if (!isRepositoryProviderError(error, 404)) throw error
        return false
      },
    )
  if (destinationExists)
    throw new UserError(`An entry already exists at ${newPath}`)
  const commit = schemaCommitOptions(context.schema)
  const identity = resolveCommitIdentity({
    configuration: context.configuration.object,
    identityOverride: commit.identity,
  })
  const message = resolveCommitMessage({
    configuration: context.configuration.object,
    templatesOverride: commit.templates,
    action: 'rename',
    tokens: buildCommitTokens({
      action: 'rename',
      owner: input.owner,
      repo: input.repo,
      branch: input.branch,
      oldPath: context.path,
      newPath,
      contentName: input.name,
      user: input.user.email,
      userName: input.user.name,
      userEmail: input.user.email,
    }),
  })
  const result = await context.api.renameFile({
    moves,
    expectedHead: 'revision' in moves[0] ? moves[0].revision : undefined,
    owner: input.owner,
    repo: input.repo,
    branch: input.branch,
    path: context.path,
    newPath,
    sha: input.sha,
    message,
    ...(identity === 'user'
      ? {
          committer: {
            name: input.user.name || input.user.email,
            email: input.user.email,
          },
        }
      : {}),
  })
  await updateRepositoryCacheAfterMutation(
    input.database,
    context.api,
    input.owner,
    input.repo,
    input.branch,
    result,
    moves.flatMap((move) => [
      { path: move.path, removed: true },
      {
        path: move.newPath,
        removed: false,
        sourcePath: move.path,
        sha: move.sha,
      },
    ]),
    undefined,
    context.configuration.repositoryId,
  )
  return { ...result, moves }
}
