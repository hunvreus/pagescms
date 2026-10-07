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
import { mediaUploadFilename, parseUploadRename } from '#/lib/media-upload-name'
import type { UploadRename } from '#/lib/media-upload-name'

import { createConfigurationStore } from './configuration-store.server'
import { updateRepositoryCacheAfterMutation } from './repository-cache.server'
import {
  createDirectoryCache,
  invalidateDirectoryCacheAfterMutation,
} from './directory-cache.server'
import {
  createDirectMediaDelivery,
  createGitHubMediaStorage,
  resolveMediaProvider,
} from './media-provider.server'

import type { CommitIdentity, CommitTemplates } from '#/lib/commit-message'
import type { MediaSchema } from '#/lib/configuration-content'
import type { Database } from './database/client.server'
import type { ProjectUser } from './projects.server'
import type { RepositoryAccessService } from './repository-access.server'
import type {
  MediaAsset,
  MediaOrigin,
  MediaDeliveryLease,
  MediaProviderResolver,
  MediaProviderSelection,
} from './media-provider.server'

type MediaInput = {
  database: Database
  repositoryAccess: RepositoryAccessService
  user: ProjectUser
  owner: string
  repo: string
  branch: string
  name: string
  mediaProviderResolver?: MediaProviderResolver
  rename?: UploadRename
  idempotencyKey?: string
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

function immediateParent(path: string) {
  const separator = path.lastIndexOf('/')
  return separator === -1 ? '' : path.slice(0, separator)
}

export function confineMediaAssets(
  schema: MediaSchema,
  directory: string,
  assets: MediaAsset[],
) {
  return assets.filter((asset) => {
    try {
      const path = normalizeGitPath(asset.path)
      return (
        mediaDirectoryPath(schema, path) === path &&
        immediateParent(path) === directory
      )
    } catch {
      return false
    }
  })
}

export function confineMediaDeliveryValues<
  TValue extends MediaOrigin | MediaDeliveryLease,
>(schema: MediaSchema, requestedPaths: string[], values: TValue[]) {
  const requested = new Set(requestedPaths)
  const confined = new Map<string, TValue>()
  for (const value of values) {
    try {
      const path = normalizeGitPath(value.path)
      if (
        requested.has(path) &&
        mediaDirectoryPath(schema, path) === path &&
        !confined.has(path)
      ) {
        confined.set(path, value)
      }
    } catch {
      // Provider output is untrusted at this boundary; omit invalid values.
    }
  }
  return [...confined.values()]
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
  const selection: MediaProviderSelection = {
    owner: input.owner,
    repo: input.repo,
    branch: input.branch,
    media: {
      name: schema.name,
      rootPath: normalizeGitPath(schema.input),
      output: typeof schema.output === 'string' ? schema.output : null,
      extensions: Array.isArray(schema.extensions)
        ? schema.extensions.filter(
            (value): value is string => typeof value === 'string',
          )
        : [],
    },
  }
  const directoryCache = createDirectoryCache({ database: input.database })
  const githubStorage = createGitHubMediaStorage({
    api,
    owner: input.owner,
    repo: input.repo,
    branch: input.branch,
    onMutation: (result, changes, knownFiles) =>
      updateRepositoryCacheAfterMutation(
        input.database,
        api,
        input.owner,
        input.repo,
        input.branch,
        result,
        changes,
        knownFiles,
      ),
    list: async (path) =>
      (
        await directoryCache.get({
          api,
          owner: input.owner,
          repo: input.repo,
          branch: input.branch,
          path,
          context: 'media',
          enabled: true,
        })
      ).entries,
    resolveDirectory: async (path) =>
      (
        await directoryCache.get({
          api,
          owner: input.owner,
          repo: input.repo,
          branch: input.branch,
          path,
          context: 'media',
          enabled: false,
        })
      ).entries,
  })
  const { storage, delivery } = resolveMediaProvider({
    resolver: input.mediaProviderResolver,
    selection,
    fallbackStorage: githubStorage,
    fallbackDelivery: createDirectMediaDelivery(),
  })
  return { api, configuration, schema, selection, storage, delivery }
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
  const { schema, storage } = await context(input)
  const path = mediaDirectoryPath(schema, input.path)
  const manifest = await storage.list(path)
  const entries = confineMediaAssets(schema, path, manifest.assets)
    .filter(
      (entry) =>
        entry.name !== '.gitkeep' &&
        (entry.kind === 'directory' || allowedExtension(schema, entry.path)),
    )
    .sort((left, right) =>
      left.kind === right.kind
        ? left.name.localeCompare(right.name)
        : left.kind === 'directory'
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
      provider: manifest.provider,
      capabilities: storage.capabilities,
    },
    entries: entries.map((entry) => ({
      id: entry.id,
      type: entry.kind === 'directory' ? ('dir' as const) : ('file' as const),
      name: entry.name,
      path: entry.path,
      sha: entry.sha,
      size: entry.size,
      contentType: entry.contentType,
    })),
  }
}

export async function loadMediaDelivery(
  input: MediaInput & { paths: string[] },
) {
  const { schema, storage, delivery } = await context(input)
  const { paths, errors } = partitionMediaDeliveryPaths(schema, input.paths)
  const origins = confineMediaDeliveryValues(
    schema,
    paths,
    await storage.resolveOrigins(paths),
  )
  const leases = confineMediaDeliveryValues(
    schema,
    paths,
    await delivery.resolve(origins),
  )
  const resolved = new Set(leases.map((lease) => lease.path))
  for (const path of paths) {
    if (!resolved.has(path)) {
      errors.push({ path, message: 'Media delivery is unavailable' })
    }
  }
  return {
    provider: storage.id,
    delivery: delivery.id,
    leases,
    errors,
  }
}

export function partitionMediaDeliveryPaths(
  schema: MediaSchema,
  inputPaths: string[],
) {
  const paths: string[] = []
  const errors: Array<{ path: string; message: string }> = []
  for (const path of new Set(inputPaths)) {
    try {
      const normalized = mediaDirectoryPath(schema, path)
      if (!allowedExtension(schema, normalized)) {
        throw new Error('This file extension is not allowed')
      }
      paths.push(normalized)
    } catch (error) {
      errors.push({
        path,
        message: error instanceof Error ? error.message : 'Invalid media path',
      })
    }
  }
  return { paths, errors }
}

export async function loadMediaAsset(input: MediaInput & { path: string }) {
  const { schema, storage } = await context(input)
  const path = mediaDirectoryPath(schema, input.path)
  if (path === normalizeGitPath(schema.input)) {
    throw new Error('Media asset path must identify a file')
  }
  if (!allowedExtension(schema, path)) {
    throw new Error('This file extension is not allowed')
  }
  return storage.read(path)
}

export async function loadMediaPreview(
  input: MediaInput & { path: string; ifNoneMatch?: string },
) {
  const { schema, storage } = await context(input)
  const path = mediaDirectoryPath(schema, input.path)
  if (path === normalizeGitPath(schema.input))
    throw new Error('Media asset path must identify a file')
  if (!allowedExtension(schema, path))
    throw new Error('This file extension is not allowed')
  if (storage.preview) return storage.preview(path, input.ifNoneMatch)
  const file = await storage.read(path)
  const etag = `"${file.version}"`
  const notModified = input.ifNoneMatch === etag
  return {
    etag,
    notModified,
    body: notModified
      ? null
      : new Response(new Uint8Array(file.bytes).buffer).body,
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
  const { path, storage, metadata } = await mediaUploadTarget(input)
  const result = await storage.write({
    path,
    content: input.content,
    metadata,
  })
  await invalidateDirectoryCacheAfterMutation(
    input.database,
    input.owner,
    input.repo,
    input.branch,
    [path],
    result.revision,
  )
  return result
}

async function mediaUploadTarget(
  input: MediaInput & {
    user: ProjectUser & { name: string }
    parent?: string
    filename: string
  },
) {
  const { configuration, schema, storage } = await context(input)
  const parent = mediaDirectoryPath(schema, input.parent)
  const original = normalizeGitPath(input.filename.trim())
  if (!original || original.includes('/')) {
    throw new Error('Media filename must be a non-empty file name')
  }
  const filename = await mediaUploadFilename(
    original,
    input.rename ?? parseUploadRename(schema.rename),
    input.idempotencyKey ?? '',
  )
  const path = normalizeGitPath(parent ? `${parent}/${filename}` : filename)
  if (!allowedExtension(schema, path)) {
    throw new Error('This file extension is not allowed')
  }
  const commit = commitOptions(schema)
  const identity = resolveCommitIdentity({
    configuration: configuration.object,
    identityOverride: commit.identity,
  })
  return {
    path,
    storage,
    metadata: {
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
        ? { actor: committer(identity, input.user) }
        : {}),
    },
  }
}

export async function prepareMediaUpload(
  input: MediaInput & {
    user: ProjectUser & { name: string }
    parent?: string
    filename: string
    size: number
    contentType: string
  },
) {
  const { path, storage, metadata } = await mediaUploadTarget(input)
  return {
    path,
    direct: storage.directUpload
      ? (reservationId: string) =>
          storage.directUpload!.initiate({
            path,
            size: input.size,
            contentType: input.contentType,
            metadata,
            reservationId,
          })
      : null,
  }
}

export async function completeMediaUpload(
  input: MediaInput & {
    path: string
    ticket: string
    parts?: readonly { number: number; etag: string }[]
  },
) {
  const { schema, storage } = await context(input)
  const expectedPath = mediaDirectoryPath(schema, input.path)
  if (!storage.directUpload) throw new Error('Direct upload is unavailable')
  const completed = await storage.directUpload.complete({
    ticket: input.ticket,
    parts: input.parts,
  })
  if (completed.result.path !== expectedPath) {
    throw new Error('Completed upload path does not match its request')
  }
  await invalidateDirectoryCacheAfterMutation(
    input.database,
    input.owner,
    input.repo,
    input.branch,
    [expectedPath],
    completed.result.revision,
  )
  return completed
}

export async function abortMediaUpload(
  input: MediaInput & { path: string; ticket: string },
) {
  const { schema, storage } = await context(input)
  const expectedPath = mediaDirectoryPath(schema, input.path)
  if (!storage.directUpload) throw new Error('Direct upload is unavailable')
  const aborted = await storage.directUpload.abort({ ticket: input.ticket })
  if (aborted.path !== expectedPath) {
    throw new Error('Aborted upload path does not match its request')
  }
  return aborted
}

export async function createMediaDirectory(
  input: MediaInput & {
    user: ProjectUser & { name: string }
    parent?: string
    folder: string
  },
) {
  const { configuration, schema, storage } = await context(input)
  const parent = mediaDirectoryPath(schema, input.parent)
  const folder = normalizeGitPath(input.folder)
  if (!folder || folder.split('/').some((part) => part === '.gitkeep')) {
    throw new Error('Media folder name is invalid')
  }
  const directory = mediaDirectoryPath(
    schema,
    normalizeGitPath(parent ? `${parent}/${folder}` : folder),
  )
  const markerPath = normalizeGitPath(`${directory}/.gitkeep`)
  const commit = commitOptions(schema)
  const identity = resolveCommitIdentity({
    configuration: configuration.object,
    identityOverride: commit.identity,
  })
  const result = await storage.createDirectory({
    path: directory,
    metadata: {
      message: resolveCommitMessage({
        configuration: configuration.object,
        templatesOverride: commit.templates,
        action: 'create',
        tokens: buildCommitTokens({
          action: 'create',
          owner: input.owner,
          repo: input.repo,
          branch: input.branch,
          path: markerPath,
          contentName: input.name,
          user: input.user.email,
          userName: input.user.name,
          userEmail: input.user.email,
        }),
      }),
      ...(committer(identity, input.user)
        ? { actor: committer(identity, input.user) }
        : {}),
    },
  })
  await invalidateDirectoryCacheAfterMutation(
    input.database,
    input.owner,
    input.repo,
    input.branch,
    [markerPath],
    result.revision,
  )
  return result
}

export async function deleteMedia(
  input: MediaInput & {
    user: ProjectUser & { name: string }
    path: string
    sha: string
  },
) {
  const { configuration, schema, storage } = await context(input)
  const path = mediaDirectoryPath(schema, input.path)
  if (!allowedExtension(schema, path)) throw new Error('Invalid media path')
  const commit = commitOptions(schema)
  const identity = resolveCommitIdentity({
    configuration: configuration.object,
    identityOverride: commit.identity,
  })
  const result = await storage.remove({
    path,
    version: input.sha,
    metadata: {
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
        ? { actor: committer(identity, input.user) }
        : {}),
    },
  })
  await invalidateDirectoryCacheAfterMutation(
    input.database,
    input.owner,
    input.repo,
    input.branch,
    [path],
    result.revision,
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
  const { configuration, schema, storage } = await context(input)
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
  const result = await storage.move({
    path,
    destination: newPath,
    version: input.sha,
    metadata: {
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
        ? { actor: committer(identity, input.user) }
        : {}),
    },
  })
  await invalidateDirectoryCacheAfterMutation(
    input.database,
    input.owner,
    input.repo,
    input.branch,
    [path, newPath],
    result.revision,
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
  const { configuration, schema, storage } = await context(input)
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
  const result = await storage.move({
    path,
    destination: newPath,
    version: input.sha,
    metadata: {
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
        ? { actor: committer(identity, input.user) }
        : {}),
    },
  })
  await invalidateDirectoryCacheAfterMutation(
    input.database,
    input.owner,
    input.repo,
    input.branch,
    [path, newPath],
    result.revision,
  )
  return result
}
