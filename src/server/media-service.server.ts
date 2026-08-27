import {
  buildCommitTokens,
  resolveCommitIdentity,
  resolveCommitMessage,
} from '#/lib/commit-message'
import { schemaActions } from '#/lib/actions'
import { base64ByteLength } from '#/lib/base64'
import { isCacheEnabled } from '#/lib/configuration'
import {
  findMediaSchema,
  mediaDirectoryPath,
} from '#/lib/configuration-content'
import { getFileExtension } from '#/lib/file-types'
import { normalizeGitPath } from '#/lib/git-path'

import { createConfigurationStore } from './configuration-store.server'
import {
  createDirectoryCache,
  invalidateDirectoryCacheAfterMutation,
} from './directory-cache.server'

import type { CommitIdentity, CommitTemplates } from '#/lib/commit-message'
import type { MediaSchema } from '#/lib/configuration-content'
import type { Database } from './database/client.server'
import type { ProjectUser } from './projects.server'
import type { RepositoryAccessService } from './repository-access.server'

type MediaInput = {
  database: Database
  repositoryAccess: RepositoryAccessService
  user: ProjectUser
  owner: string
  repo: string
  branch: string
  name: string
}

function encodeBase64(value: string) {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
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
  const { api, configuration, schema } = await context(input)
  const path = mediaDirectoryPath(schema, input.path)
  const directory = await createDirectoryCache({
    database: input.database,
  }).get({
    api,
    owner: input.owner,
    repo: input.repo,
    branch: input.branch,
    path,
    context: 'media',
    enabled: isCacheEnabled(configuration.object),
  })
  const entries = directory.entries
    .filter(
      (entry) =>
        entry.name !== '.gitkeep' &&
        (entry.type === 'dir' || allowedExtension(schema, entry.path)),
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

export async function loadMediaAsset(input: MediaInput & { path: string }) {
  const { api, schema } = await context(input)
  const path = mediaDirectoryPath(schema, input.path)
  if (path === normalizeGitPath(schema.input)) {
    throw new Error('Media asset path must identify a file')
  }
  if (!allowedExtension(schema, path)) {
    throw new Error('This file extension is not allowed')
  }
  return api.getFile(input.owner, input.repo, path, input.branch)
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
  const result = await api.putFile({
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
  await invalidateDirectoryCacheAfterMutation(
    input.database,
    input.owner,
    input.repo,
    input.branch,
  )
  return result
}

export async function createMediaDirectory(
  input: MediaInput & {
    user: ProjectUser & { name: string }
    parent?: string
    folder: string
  },
) {
  const { api, configuration, schema } = await context(input)
  const parent = mediaDirectoryPath(schema, input.parent)
  const folder = normalizeGitPath(input.folder)
  if (!folder || folder.split('/').some((part) => part === '.gitkeep')) {
    throw new Error('Media folder name is invalid')
  }
  const directory = mediaDirectoryPath(
    schema,
    normalizeGitPath(parent ? `${parent}/${folder}` : folder),
  )
  const path = normalizeGitPath(`${directory}/.gitkeep`)
  const commit = commitOptions(schema)
  const identity = resolveCommitIdentity({
    configuration: configuration.object,
    identityOverride: commit.identity,
  })
  const result = await api.putFile({
    owner: input.owner,
    repo: input.repo,
    branch: input.branch,
    path,
    content: encodeBase64(''),
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
  await invalidateDirectoryCacheAfterMutation(
    input.database,
    input.owner,
    input.repo,
    input.branch,
  )
  return { ...result, path: directory }
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
  const result = await api.deleteFile({
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
  await invalidateDirectoryCacheAfterMutation(
    input.database,
    input.owner,
    input.repo,
    input.branch,
  )
  return result
}

export async function renameMediaFile(
  input: MediaInput & {
    user: ProjectUser & { name: string }
    path: string
    sha: string
    filename: string
  },
) {
  const { api, configuration, schema } = await context(input)
  const path = mediaDirectoryPath(schema, input.path)
  if (!allowedExtension(schema, path)) throw new Error('Invalid media path')
  const filename = normalizeGitPath(input.filename.trim())
  if (!filename || filename.includes('/')) {
    throw new Error('Media filename must be a non-empty file name')
  }
  const separator = path.lastIndexOf('/')
  const parent = separator === -1 ? '' : path.slice(0, separator)
  const newPath = mediaDirectoryPath(
    schema,
    normalizeGitPath(parent ? `${parent}/${filename}` : filename),
  )
  if (!allowedExtension(schema, newPath)) {
    throw new Error('This file extension is not allowed')
  }
  if (newPath === path) throw new Error('The filename has not changed')
  const commit = commitOptions(schema)
  const identity = resolveCommitIdentity({
    configuration: configuration.object,
    identityOverride: commit.identity,
  })
  const result = await api.renameFile({
    owner: input.owner,
    repo: input.repo,
    branch: input.branch,
    path,
    newPath,
    sha: input.sha,
    message: resolveCommitMessage({
      configuration: configuration.object,
      templatesOverride: commit.templates,
      action: 'rename',
      tokens: buildCommitTokens({
        action: 'rename',
        owner: input.owner,
        repo: input.repo,
        branch: input.branch,
        oldPath: path,
        newPath,
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
  await invalidateDirectoryCacheAfterMutation(
    input.database,
    input.owner,
    input.repo,
    input.branch,
  )
  return result
}

export async function moveMediaFile(
  input: MediaInput & {
    user: ProjectUser & { name: string }
    path: string
    sha: string
    destination: string
  },
) {
  const { api, configuration, schema } = await context(input)
  const path = mediaDirectoryPath(schema, input.path)
  if (!allowedExtension(schema, path)) throw new Error('Invalid media path')
  const destination = mediaDirectoryPath(schema, input.destination)
  const filename = path.split('/').at(-1)
  if (!filename) throw new Error('Invalid media path')
  const newPath = mediaDirectoryPath(
    schema,
    normalizeGitPath(destination ? `${destination}/${filename}` : filename),
  )
  if (newPath === path) throw new Error('The file is already in this folder')
  const commit = commitOptions(schema)
  const identity = resolveCommitIdentity({
    configuration: configuration.object,
    identityOverride: commit.identity,
  })
  const result = await api.renameFile({
    owner: input.owner,
    repo: input.repo,
    branch: input.branch,
    path,
    newPath,
    sha: input.sha,
    message: resolveCommitMessage({
      configuration: configuration.object,
      templatesOverride: commit.templates,
      action: 'rename',
      tokens: buildCommitTokens({
        action: 'rename',
        owner: input.owner,
        repo: input.repo,
        branch: input.branch,
        oldPath: path,
        newPath,
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
  await invalidateDirectoryCacheAfterMutation(
    input.database,
    input.owner,
    input.repo,
    input.branch,
  )
  return result
}
