import {
  buildCommitTokens,
  resolveCommitIdentity,
  resolveCommitMessage,
} from '#/lib/commit-message'
import { schemaActions } from '#/lib/actions'
import { generateContentFilename } from '#/lib/content-filename'
import {
  collectionDirectoryPath,
  configuredMediaSchemas,
  findContentSchema,
} from '#/lib/configuration-content'
import { parseContent, serializeContent } from '#/lib/content-serialization'
import {
  isContentOperationAllowed,
  resolveContentOperations,
} from '#/lib/content-operations'
import {
  initializeStructuredContent,
  validateStructuredContent,
} from '#/lib/field-values'
import { getFileExtension } from '#/lib/file-types'
import { normalizeGitPath } from '#/lib/git-path'
import { toJsonObject, toJsonValue } from '#/lib/json'

import { createConfigurationStore } from './configuration-store.server'
import { invalidateDirectoryCacheAfterMutation } from './directory-cache.server'
import { GitHubApiError } from './github-api.server'

import type { CommitIdentity, CommitTemplates } from '#/lib/commit-message'
import type {
  ContentFormat,
  FrontmatterDelimiters,
} from '#/lib/content-serialization'
import type { Database } from './database/client.server'
import type { BackgroundExecutor } from './runtime-ports.server'
import type { ProjectUser } from './projects.server'
import type { RepositoryAccessService } from './repository-access.server'

const formats = new Set<ContentFormat>([
  'yaml',
  'json',
  'toml',
  'yaml-frontmatter',
  'json-frontmatter',
  'toml-frontmatter',
])

function decodeBase64(value: string) {
  const binary = atob(value.replace(/\s/g, ''))
  return new TextDecoder().decode(
    Uint8Array.from(binary, (item) => item.charCodeAt(0)),
  )
}

function encodeBase64(value: string) {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

async function loadContext(
  database: Database,
  background: BackgroundExecutor,
  repositoryAccess: RepositoryAccessService,
  user: ProjectUser,
  owner: string,
  repo: string,
  branch: string,
  name: string,
  path: string,
) {
  const { api } = await repositoryAccess.resolve(user, owner, repo, branch)
  const configuration = await createConfigurationStore({
    database,
    background,
  }).get(api, owner, repo, branch)
  if (!configuration) throw new Error('Repository configuration not found')
  const schema = findContentSchema(configuration.object, name)
  if (!schema) throw new Error(`Content schema ${name} was not found`)
  const normalizedPath = normalizeGitPath(path)
  const root = normalizeGitPath(schema.path)
  if (normalizedPath !== root && !normalizedPath.startsWith(`${root}/`)) {
    throw new Error('Entry path is outside its configured content root')
  }
  if (
    typeof schema.extension === 'string' &&
    getFileExtension(normalizedPath) !== schema.extension
  ) {
    throw new Error('Entry extension does not match its content schema')
  }
  return { api, configuration, schema, path: normalizedPath }
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

export async function loadRawEntry(input: {
  database: Database
  background: BackgroundExecutor
  repositoryAccess: RepositoryAccessService
  user: ProjectUser
  owner: string
  repo: string
  branch: string
  name: string
  path: string
}) {
  const context = await loadContext(
    input.database,
    input.background,
    input.repositoryAccess,
    input.user,
    input.owner,
    input.repo,
    input.branch,
    input.name,
    input.path,
  )
  const file = await context.api.getFile(
    input.owner,
    input.repo,
    context.path,
    input.branch,
  )
  const source = decodeBase64(file.content)
  const fields = Array.isArray(context.schema.fields)
    ? context.schema.fields
    : []
  const format =
    typeof context.schema.format === 'string' &&
    formats.has(context.schema.format as ContentFormat)
      ? (context.schema.format as ContentFormat)
      : undefined
  const shared = {
    source,
    sha: file.sha,
    path: context.path,
    label:
      typeof context.schema.label === 'string' && context.schema.label
        ? context.schema.label
        : context.schema.name,
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
      mode: 'structured' as const,
      fields: toJsonValue(fields),
      content: toJsonObject(
        parseContent(source, {
          format,
          delimiters: context.schema.delimiters as
            FrontmatterDelimiters | undefined,
        }),
      ),
    }
  }
  return {
    ...shared,
    mode: 'raw' as const,
  }
}

export async function loadEntryHistory(input: {
  database: Database
  background: BackgroundExecutor
  repositoryAccess: RepositoryAccessService
  user: ProjectUser
  owner: string
  repo: string
  branch: string
  name: string
  path: string
}) {
  const context = await loadContext(
    input.database,
    input.background,
    input.repositoryAccess,
    input.user,
    input.owner,
    input.repo,
    input.branch,
    input.name,
    input.path,
  )
  return context.api.listFileCommits(
    input.owner,
    input.repo,
    input.branch,
    context.path,
  )
}

export async function loadFixedFile(
  input: Omit<Parameters<typeof loadRawEntry>[0], 'path'>,
) {
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
  const schema = findContentSchema(configuration.object, input.name)
  if (!schema || schema.type !== 'file') {
    throw new Error(`File ${input.name} was not found`)
  }
  try {
    return await loadRawEntry({ ...input, path: schema.path })
  } catch (error) {
    if (!(error instanceof GitHubApiError) || error.status !== 404) throw error
  }
  if (!isContentOperationAllowed('create', { schema })) {
    throw new Error('This file does not exist and creating it is disabled')
  }
  const fields = Array.isArray(schema.fields) ? schema.fields : []
  const format =
    typeof schema.format === 'string' &&
    formats.has(schema.format as ContentFormat)
      ? (schema.format as ContentFormat)
      : undefined
  const shared = {
    source: '',
    sha: null,
    path: normalizeGitPath(schema.path),
    label:
      typeof schema.label === 'string' && schema.label
        ? schema.label
        : schema.name,
    operations: resolveContentOperations({ schema }),
    actionContextType: 'file' as const,
    actions: schemaActions(schema),
    media: configuredMediaSchemas(configuration.object),
  }
  if (fields.length && format) {
    return {
      ...shared,
      mode: 'structured' as const,
      fields: toJsonValue(fields),
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
  const content = toJsonObject(input.content)
  const context = await loadContext(
    input.database,
    input.background,
    input.repositoryAccess,
    input.user,
    input.owner,
    input.repo,
    input.branch,
    input.name,
    input.path,
  )
  const fields = Array.isArray(context.schema.fields)
    ? context.schema.fields
    : []
  const errors = validateStructuredContent(fields, content)
  if (errors.length) throw new Error(errors[0])
  if (
    typeof context.schema.format !== 'string' ||
    !formats.has(context.schema.format as ContentFormat)
  ) {
    throw new Error('This content schema does not use a structured format')
  }
  const source = serializeContent(content, {
    format: context.schema.format as ContentFormat,
    delimiters: context.schema.delimiters as FrontmatterDelimiters | undefined,
  })
  return saveRawEntry({ ...input, source })
}

export async function saveRawEntry(input: {
  database: Database
  background: BackgroundExecutor
  repositoryAccess: RepositoryAccessService
  user: ProjectUser & { name: string }
  owner: string
  repo: string
  branch: string
  name: string
  path: string
  source: string
  sha?: string
}) {
  if (input.source.length > 5_000_000)
    throw new Error('Entry exceeds the 5 MB limit')
  const context = await loadContext(
    input.database,
    input.background,
    input.repositoryAccess,
    input.user,
    input.owner,
    input.repo,
    input.branch,
    input.name,
    input.path,
  )
  if (
    typeof context.schema.format === 'string' &&
    formats.has(context.schema.format as ContentFormat)
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
  const message = resolveCommitMessage({
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
  const result = await context.api.putFile({
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
  await invalidateDirectoryCacheAfterMutation(
    input.database,
    input.owner,
    input.repo,
    input.branch,
  )
  return result
}

export async function createStructuredEntry(
  input: Omit<Parameters<typeof saveStructuredEntry>[0], 'path' | 'sha'> & {
    parent?: string
    filename?: string
  },
) {
  const content = toJsonObject(input.content)
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
  const schema = findContentSchema(configuration.object, input.name)
  if (!schema || schema.type !== 'collection') {
    throw new Error(`Collection ${input.name} was not found`)
  }
  if (!isContentOperationAllowed('create', { schema })) {
    throw new Error('Creating entries is disabled for this collection')
  }
  const parent = collectionDirectoryPath(schema, input.parent)
  let filename: string
  if (input.filename !== undefined) {
    if (schema.filenameField !== true && schema.filenameField !== 'create') {
      throw new Error('Custom filenames are disabled for this collection')
    }
    filename = normalizeGitPath(input.filename.trim())
    if (!filename || filename.includes('/')) {
      throw new Error('Filename must be a non-empty file name')
    }
  } else {
    if (typeof schema.filename !== 'string') {
      throw new Error('Collection filename template is missing')
    }
    filename = generateContentFilename(schema.filename, schema, content)
  }
  const path = normalizeGitPath(parent ? `${parent}/${filename}` : filename)
  return {
    ...(await saveStructuredEntry({ ...input, content, path })),
    path,
  }
}

async function loadCollectionCreationContext(input: {
  database: Database
  background: BackgroundExecutor
  repositoryAccess: RepositoryAccessService
  user: ProjectUser
  owner: string
  repo: string
  branch: string
  name: string
  parent?: string
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
  const schema = findContentSchema(configuration.object, input.name)
  if (!schema || schema.type !== 'collection') {
    throw new Error(`Collection ${input.name} was not found`)
  }
  if (!isContentOperationAllowed('create', { schema })) {
    throw new Error('Creating entries is disabled for this collection')
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
  },
) {
  const context = await loadCollectionCreationContext(input)
  let filename: string
  if (input.filename !== undefined) {
    if (
      context.schema.filenameField !== true &&
      context.schema.filenameField !== 'create'
    ) {
      throw new Error('Custom filenames are disabled for this collection')
    }
    filename = normalizeGitPath(input.filename.trim())
    if (!filename || filename.includes('/')) {
      throw new Error('Filename must be a non-empty file name')
    }
  } else {
    if (typeof context.schema.filename !== 'string') {
      throw new Error('Collection filename template is missing')
    }
    filename = generateContentFilename(
      context.schema.filename,
      context.schema,
      {},
    )
  }
  const path = normalizeGitPath(
    context.parent ? `${context.parent}/${filename}` : filename,
  )
  return {
    ...(await saveRawEntry({ ...input, path })),
    path,
  }
}

export async function createContentFolder(
  input: Omit<Parameters<typeof saveRawEntry>[0], 'path' | 'source' | 'sha'> & {
    parent: string
    folder: string
  },
) {
  const context = await loadCollectionCreationContext(input)
  if (context.schema.subfolders === false) {
    throw new Error('This collection does not allow subfolders')
  }
  const folder = normalizeGitPath(input.folder)
  if (!folder || folder.split('/').some((part) => part === '.gitkeep')) {
    throw new Error('Folder name is invalid')
  }
  const directory = collectionDirectoryPath(
    context.schema,
    `${context.parent}/${folder}`,
  )
  const path = normalizeGitPath(`${directory}/.gitkeep`)
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
  await invalidateDirectoryCacheAfterMutation(
    input.database,
    input.owner,
    input.repo,
    input.branch,
  )
  return { ...result, path: directory }
}

export async function deleteContentEntry(input: {
  database: Database
  background: BackgroundExecutor
  repositoryAccess: RepositoryAccessService
  user: ProjectUser & { name: string }
  owner: string
  repo: string
  branch: string
  name: string
  path: string
  sha: string
}) {
  const context = await loadContext(
    input.database,
    input.background,
    input.repositoryAccess,
    input.user,
    input.owner,
    input.repo,
    input.branch,
    input.name,
    input.path,
  )
  if (!isContentOperationAllowed('delete', { schema: context.schema })) {
    throw new Error('Deleting this content is disabled')
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
  await invalidateDirectoryCacheAfterMutation(
    input.database,
    input.owner,
    input.repo,
    input.branch,
  )
  return result
}

export async function renameContentEntry(
  input: Parameters<typeof deleteContentEntry>[0] & { filename: string },
) {
  const context = await loadContext(
    input.database,
    input.background,
    input.repositoryAccess,
    input.user,
    input.owner,
    input.repo,
    input.branch,
    input.name,
    input.path,
  )
  if (!isContentOperationAllowed('rename', { schema: context.schema })) {
    throw new Error('Renaming this content is disabled')
  }
  const filename = normalizeGitPath(input.filename.trim())
  if (!filename || filename.includes('/')) {
    throw new Error('Filename must be a non-empty file name')
  }
  const separator = context.path.lastIndexOf('/')
  const parent = separator === -1 ? '' : context.path.slice(0, separator)
  const newPath = normalizeGitPath(parent ? `${parent}/${filename}` : filename)
  await loadContext(
    input.database,
    input.background,
    input.repositoryAccess,
    input.user,
    input.owner,
    input.repo,
    input.branch,
    input.name,
    newPath,
  )
  if (newPath === context.path) throw new Error('The filename has not changed')
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
  await invalidateDirectoryCacheAfterMutation(
    input.database,
    input.owner,
    input.repo,
    input.branch,
  )
  return result
}
