import {
  buildCommitTokens,
  resolveCommitIdentity,
  resolveCommitMessage,
} from '#/lib/commit-message'
import { findContentSchema } from '#/lib/configuration-content'
import { parseContent, serializeContent } from '#/lib/content-serialization'
import { validateStructuredContent } from '#/lib/field-values'
import { getFileExtension } from '#/lib/file-types'
import { normalizeGitPath } from '#/lib/git-path'
import { toJsonObject, toJsonValue } from '#/lib/json'

import { createConfigurationStore } from './configuration-store.server'

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
  sha: string
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
  const identity = resolveCommitIdentity({
    configuration: context.configuration.object,
    identityOverride: commit.identity,
  })
  const message = resolveCommitMessage({
    configuration: context.configuration.object,
    templatesOverride: commit.templates,
    action: 'update',
    tokens: buildCommitTokens({
      action: 'update',
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
  return context.api.putFile({
    owner: input.owner,
    repo: input.repo,
    branch: input.branch,
    path: context.path,
    content: encodeBase64(input.source),
    message,
    sha: input.sha,
    ...(identity === 'user'
      ? {
          committer: {
            name: input.user.name || input.user.email,
            email: input.user.email,
          },
        }
      : {}),
  })
}
