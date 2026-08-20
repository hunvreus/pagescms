import {
  buildCommitTokens,
  resolveCommitIdentity,
  resolveCommitMessage,
} from '#/lib/commit-message'
import { schemaActions } from '#/lib/actions'
import { base64ByteLength } from '#/lib/base64'
import {
  findMediaSchema,
  mediaDirectoryPath,
} from '#/lib/configuration-content'
import { getFileExtension } from '#/lib/file-types'
import { normalizeGitPath } from '#/lib/git-path'

import { createConfigurationStore } from './configuration-store.server'

import type { CommitIdentity, CommitTemplates } from '#/lib/commit-message'
import type { MediaSchema } from '#/lib/configuration-content'
import type { Database } from './database/client.server'
import type { ProjectUser } from './projects.server'
import type { RepositoryAccessService } from './repository-access.server'
import type { BackgroundExecutor } from './runtime-ports.server'

type MediaInput = {
  database: Database
  background: BackgroundExecutor
  repositoryAccess: RepositoryAccessService
  user: ProjectUser
  owner: string
  repo: string
  branch: string
  name: string
}

function allowedExtension(schema: MediaSchema, path: string) {
  const extensions = Array.isArray(schema.extensions)
    ? schema.extensions.filter(
        (value): value is string => typeof value === 'string',
      )
    : []
  return (
    extensions.length === 0 ||
    extensions
      .map((value) => value.toLowerCase())
      .includes(getFileExtension(path).toLowerCase())
  )
}

async function context(input: MediaInput) {
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
  const schema = findMediaSchema(configuration.object, input.name)
  if (!schema) throw new Error(`Media ${input.name} was not found`)
  return { api, configuration, schema }
}

function commitOptions(schema: MediaSchema): {
  templates: CommitTemplates | undefined
  identity: CommitIdentity | undefined
} {
  const commit =
    typeof schema.commit === 'object' && schema.commit !== null
      ? (schema.commit as Record<string, unknown>)
      : {}
  return {
    templates:
      typeof commit.templates === 'object' && commit.templates !== null
        ? commit.templates
        : undefined,
    identity:
      commit.identity === 'app' || commit.identity === 'user'
        ? commit.identity
        : undefined,
  }
}

function committer(
  identity: CommitIdentity,
  user: ProjectUser & { name?: string },
) {
  return identity === 'user'
    ? { name: user.name || user.email, email: user.email }
    : undefined
}

export async function loadMediaDirectory(
  input: MediaInput & { path?: string },
) {
  const { api, schema } = await context(input)
  const path = mediaDirectoryPath(schema, input.path)
  const entries = (
    await api.getDirectory(input.owner, input.repo, input.branch, path)
  )
    .filter(
      (entry) => entry.type === 'dir' || allowedExtension(schema, entry.path),
    )
    .sort((left, right) =>
      left.type === right.type
        ? left.name.localeCompare(right.name)
        : left.type === 'dir'
          ? -1
          : 1,
    )
  return {
    media: {
      name: schema.name,
      label:
        typeof schema.label === 'string' && schema.label
          ? schema.label
          : schema.name,
      path,
      rootPath: schema.input,
      output: typeof schema.output === 'string' ? schema.output : null,
      extensions: Array.isArray(schema.extensions) ? schema.extensions : [],
      actions: schemaActions(schema),
    },
    entries: entries.map(({ content: _content, ...entry }) => entry),
  }
}

export async function uploadMedia(
  input: MediaInput & {
    user: ProjectUser & { name: string }
    parent?: string
    filename: string
    content: string
  },
) {
  if (base64ByteLength(input.content) > 20 * 1024 * 1024) {
    throw new Error('Media file exceeds the 20 MB limit')
  }
  const { api, configuration, schema } = await context(input)
  const parent = mediaDirectoryPath(schema, input.parent)
  const filename = normalizeGitPath(input.filename.trim())
  if (!filename || filename.includes('/')) {
    throw new Error('Media filename must be a non-empty file name')
  }
  const path = normalizeGitPath(parent ? `${parent}/${filename}` : filename)
  if (!allowedExtension(schema, path)) {
    throw new Error('This file extension is not allowed')
  }
  const commit = commitOptions(schema)
  const identity = resolveCommitIdentity({
    configuration: configuration.object,
    identityOverride: commit.identity,
  })
  return api.putFile({
    owner: input.owner,
    repo: input.repo,
    branch: input.branch,
    path,
    content: input.content,
    message: resolveCommitMessage({
      configuration: configuration.object,
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
    }),
    ...(committer(identity, input.user)
      ? { committer: committer(identity, input.user) }
      : {}),
  })
}

export async function deleteMedia(
  input: MediaInput & {
    user: ProjectUser & { name: string }
    path: string
    sha: string
  },
) {
  const { api, configuration, schema } = await context(input)
  const path = mediaDirectoryPath(schema, input.path)
  if (!allowedExtension(schema, path)) throw new Error('Invalid media path')
  const commit = commitOptions(schema)
  const identity = resolveCommitIdentity({
    configuration: configuration.object,
    identityOverride: commit.identity,
  })
  return api.deleteFile({
    owner: input.owner,
    repo: input.repo,
    branch: input.branch,
    path,
    sha: input.sha,
    message: resolveCommitMessage({
      configuration: configuration.object,
      templatesOverride: commit.templates,
      action: 'delete',
      tokens: buildCommitTokens({
        action: 'delete',
        owner: input.owner,
        repo: input.repo,
        branch: input.branch,
        path,
        contentName: input.name,
        user: input.user.email,
        userName: input.user.name,
        userEmail: input.user.email,
      }),
    }),
    ...(committer(identity, input.user)
      ? { committer: committer(identity, input.user) }
      : {}),
  })
}
