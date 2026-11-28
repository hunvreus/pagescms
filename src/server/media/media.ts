import { configurationStoreFor } from '#/server/cache/configuration-access'
import { UserError } from '#/server/http'
import type { MediaVariant } from '#/lib/media-variants'
import {
  findRepositoryIdentity,
  findRepositoryIdentityByExternalId,
} from '#/server/access/repository-identity'
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
} from '#/shared/configuration-content'
import { getFileExtension } from '#/lib/file-types'
import { normalizeGitPath } from '#/shared/git-path'
import { mediaUploadFilename, parseUploadRename } from '#/lib/media-upload-name'
import type { UploadRename } from '#/lib/media-upload-name'

import { admittedConfigurationScope } from '#/server/cache/configuration'
import {
  isRepositoryProviderError,
  repositorySource,
} from '../repository/provider'
import { updateRepositoryCacheAfterMutation } from '#/server/cache/repository'
import {
  createDirectoryCache,
  invalidateDirectoryCacheAfterMutation,
} from '#/server/cache/directory'
import {
  createDirectMediaDelivery,
  createGitHubMediaStorage,
  mediaUrlExpiry,
  resolveMediaProvider,
  MediaRevisionMismatchError,
  MediaNotFoundError,
} from './provider'

import type { CommitIdentity, CommitTemplates } from '#/lib/commit-message'
import type { MediaSchema } from '#/shared/configuration-content'
import type { Database } from '#/server/db/client'
import type { RepositoryUser } from '../repository/repositories'
import type { RepositoryAccessService } from '#/server/access/repository'
import type {
  MediaAsset,
  MediaOrigin,
  MediaDeliveryLease,
  MediaProviderResolver,
  MediaProviderSelection,
} from './provider'

type MediaInput = {
  database: Database
  identityDatabase?: Database
  repositoryAccess: RepositoryAccessService
  user: RepositoryUser
  owner: string
  repo: string
  repoId?: string
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
  const schema = findMediaSchema(configuration.object, input.name)
  if (!schema) throw new UserError(`Media ${input.name} was not found`)
  const identity = input.mediaProviderResolver
    ? repository
      ? await findRepositoryIdentityByExternalId(
          input.identityDatabase ?? input.database,
          String(repository.id),
          repositorySource(api),
        )
      : await findRepositoryIdentity(
          input.identityDatabase ?? input.database,
          input,
        )
    : undefined
  const selection: MediaProviderSelection = {
    ...(identity?.externalId ? { repoId: identity.externalId } : {}),
    ...(identity?.ownerId ? { ownerId: identity.ownerId } : {}),
    owner: input.owner,
    repo: input.repo,
    branch: input.branch,
    media: {
      name: schema.name,
      rootPath: normalizeGitPath(schema.input),
      configuration: schema,
      output: typeof schema.output === 'string' ? schema.output : null,
      extensions: Array.isArray(schema.extensions)
        ? schema.extensions.filter(
            (value): value is string => typeof value === 'string',
          )
        : [],
    },
  }
  const directoryCache = createDirectoryCache({
    database: input.database,
    repositoryId: configuration.repositoryId,
  })
  const githubStorage = createGitHubMediaStorage({
    api,
    owner: input.owner,
    repo: input.repo,
    branch: input.branch,
    repositoryPrivate: repository?.private,
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
        configuration.repositoryId,
      ),
    list: async (path, forceRefresh) =>
      (
        await directoryCache.get({
          api,
          owner: input.owner,
          repo: input.repo,
          branch: input.branch,
          path,
          context: 'media',
          enabled: true,
          forceRefresh,
        })
      ).entries,
    resolveDirectory: async (path, forceRefresh) => {
      const result = await directoryCache.get({
        api,
        owner: input.owner,
        repo: input.repo,
        branch: input.branch,
        path,
        context: 'media',
        enabled: repository?.private === false && !forceRefresh,
        forceRefresh,
      })
      return result.entries.map((entry) => ({
        ...entry,
        revision: entry.revision ?? result.revision ?? undefined,
      }))
    },
  })
  const githubDelivery = createDirectMediaDelivery()
  const { storage, delivery } = await resolveMediaProvider({
    resolver: input.mediaProviderResolver,
    selection,
    fallbackStorage: githubStorage,
    fallbackDelivery: githubDelivery,
  })
  const invalidate = (paths: string[], revision?: string | null) =>
    invalidateDirectoryCacheAfterMutation(
      input.database,
      input.owner,
      input.repo,
      input.branch,
      paths,
      revision,
      repositorySource(api),
      configuration.repositoryId,
    )
  return {
    api,
    configuration,
    schema,
    selection,
    storage,
    delivery,
    directGitHub: storage === githubStorage && delivery === githubDelivery,
    invalidate,
  }
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
  user: RepositoryUser & { name?: string },
) {
  return identity === 'user'
    ? { name: user.name || user.email, email: user.email }
    : undefined
}

export async function loadMediaDirectory(
  input: MediaInput & { path?: string },
) {
  const { schema, storage, directGitHub } = await context(input)
  const path = mediaDirectoryPath(schema, input.path)
  const manifest = await storage.list(path)
  const downloadUrls = new Map(
    directGitHub
      ? manifest.downloadUrls?.map(({ path: assetPath, url }) => [
          assetPath,
          url,
        ])
      : [],
  )
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
      ...(!schema.label && schema.name === 'default'
        ? { defaultLabel: true as const }
        : {}),
      label:
        typeof schema.label === 'string' && schema.label
          ? schema.label
          : schema.name === 'default'
            ? 'Media'
            : schema.name,
      path,
      rootPath: schema.input,
      output: typeof schema.output === 'string' ? schema.output : null,
      extensions: Array.isArray(schema.extensions) ? schema.extensions : [],
      actions: schemaActions(schema),
      provider: manifest.provider,
      capabilities: storage.capabilities,
    },
    entries: entries.map((entry) => {
      let delivery: MediaDeliveryLease | undefined
      const downloadUrl = downloadUrls.get(entry.path)
      if (entry.kind === 'file' && downloadUrl) {
        try {
          const url = new URL(downloadUrl)
          if (url.protocol === 'https:' || url.protocol === 'http:')
            delivery = {
              assetId: entry.id,
              path: entry.path,
              url: downloadUrl,
              expiresAt: mediaUrlExpiry(downloadUrl, new Date()),
              cacheKey: entry.sha,
            }
        } catch {
          // Invalid provider URLs can be resolved through the delivery API.
        }
      }
      return {
        id: entry.id,
        type: entry.kind === 'directory' ? ('dir' as const) : ('file' as const),
        name: entry.name,
        path: entry.path,
        sha: entry.sha,
        size: entry.size,
        contentType: entry.contentType,
        ...(delivery ? { delivery } : {}),
      }
    }),
  }
}

export async function loadMediaDelivery(
  input: MediaInput & {
    paths: string[]
    forceRefresh?: boolean
    variant?: MediaVariant
  },
) {
  const { schema, storage, delivery } = await context(input)
  const { paths, errors } = partitionMediaDeliveryPaths(schema, input.paths)
  const variant = input.variant ?? 'original'
  let leases: MediaDeliveryLease[] = []
  if (variant !== 'original' && delivery.resolveAssets) {
    const directories = [...new Set(paths.map(immediateParent))]
    const requested = new Set(paths)
    const manifests = await Promise.all(
      directories.map((directory) =>
        storage.list(directory, { forceRefresh: input.forceRefresh }),
      ),
    )
    const assets = manifests
      .flatMap((manifest) =>
        confineMediaAssets(schema, manifest.directory, manifest.assets),
      )
      .filter((asset) => requested.has(asset.path))
    leases = confineMediaDeliveryValues(
      schema,
      paths,
      await delivery.resolveAssets({ assets, variant }),
    )
  }
  const delivered = new Set(leases.map((lease) => lease.path))
  const remaining = paths.filter((path) => !delivered.has(path))
  if (remaining.length) {
    const origins = confineMediaDeliveryValues(
      schema,
      remaining,
      await storage.resolveOrigins(remaining, {
        forceRefresh: input.forceRefresh,
      }),
    )
    leases.push(
      ...confineMediaDeliveryValues(
        schema,
        remaining,
        await delivery.resolve(origins, { variant }),
      ),
    )
  }
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
        throw new UserError('This file extension is not allowed')
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

export async function loadMediaPreview(
  input: MediaInput & {
    path: string
    ifNoneMatch?: string
    variant?: MediaVariant
    revision?: string
  },
) {
  const { schema, storage, delivery } = await context(input)
  const path = mediaDirectoryPath(schema, input.path)
  if (path === normalizeGitPath(schema.input))
    throw new UserError('Media asset path must identify a file')
  if (!allowedExtension(schema, path))
    throw new UserError('This file extension is not allowed')
  if (input.variant && input.variant !== 'original' && delivery.preview) {
    let manifest = await storage.list(immediateParent(path))
    if (
      input.revision &&
      !manifest.assets.some(
        (entry) => entry.path === path && entry.sha === input.revision,
      )
    )
      manifest = await storage.list(immediateParent(path), {
        forceRefresh: true,
      })
    const asset = confineMediaAssets(
      schema,
      manifest.directory,
      manifest.assets,
    ).find((entry) => entry.path === path && entry.kind === 'file')
    if (!asset) throw new MediaNotFoundError()
    if (!asset.sha || input.revision !== asset.sha)
      throw new MediaRevisionMismatchError()
    const transformed = await delivery.preview({
      asset,
      variant: input.variant,
      read: async () => {
        const file = await storage.read(path)
        if (file.version !== asset.sha) throw new MediaRevisionMismatchError()
        return file
      },
    })
    if (transformed) {
      if (transformed.etag && input.ifNoneMatch === transformed.etag) {
        await transformed.body?.cancel()
        return { ...transformed, body: null, notModified: true }
      }
      return transformed
    }
  }
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
    user: RepositoryUser & { name: string }
    parent?: string
    filename: string
    content: string
  },
) {
  if (base64ByteLength(input.content) > 20 * 1024 * 1024) {
    throw new UserError('Media file exceeds the 20 MB limit')
  }
  const { path, storage, metadata, invalidate } = await mediaUploadTarget(input)
  const result = await storage.write({
    path,
    content: input.content,
    metadata,
  })
  await invalidate([path], result.revision)
  return result
}

async function mediaUploadTarget(
  input: MediaInput & {
    user: RepositoryUser & { name: string }
    parent?: string
    filename: string
  },
) {
  const { configuration, schema, storage, invalidate } = await context(input)
  const parent = mediaDirectoryPath(schema, input.parent)
  const original = normalizeGitPath(input.filename.trim())
  if (!original || original.includes('/')) {
    throw new UserError('Media filename must be a non-empty file name')
  }
  const filename = await mediaUploadFilename(
    original,
    input.rename ?? parseUploadRename(schema.rename),
    input.idempotencyKey ?? '',
  )
  const path = normalizeGitPath(parent ? `${parent}/${filename}` : filename)
  if (!allowedExtension(schema, path)) {
    throw new UserError('This file extension is not allowed')
  }
  const commit = commitOptions(schema)
  const identity = resolveCommitIdentity({
    configuration: configuration.object,
    identityOverride: commit.identity,
  })
  return {
    path,
    storage,
    invalidate,
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
    user: RepositoryUser & { name: string }
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
  const { schema, storage, invalidate } = await context(input)
  const expectedPath = mediaDirectoryPath(schema, input.path)
  if (!storage.directUpload) throw new UserError('Direct upload is unavailable')
  const completed = await storage.directUpload.complete({
    path: expectedPath,
    ticket: input.ticket,
    parts: input.parts,
  })
  if (completed.result.path !== expectedPath) {
    throw new UserError('Completed upload path does not match its request')
  }
  await invalidate([expectedPath], completed.result.revision)
  return completed
}

export async function abortMediaUpload(
  input: MediaInput & { path: string; ticket: string },
) {
  const { schema, storage } = await context(input)
  const expectedPath = mediaDirectoryPath(schema, input.path)
  if (!storage.directUpload) throw new UserError('Direct upload is unavailable')
  const aborted = await storage.directUpload.abort({
    path: expectedPath,
    ticket: input.ticket,
  })
  if (aborted.path !== expectedPath) {
    throw new UserError('Aborted upload path does not match its request')
  }
  return aborted
}

export async function createMediaDirectory(
  input: MediaInput & {
    user: RepositoryUser & { name: string }
    parent?: string
    folder: string
  },
) {
  const { configuration, schema, storage, invalidate } = await context(input)
  const parent = mediaDirectoryPath(schema, input.parent)
  const folder = normalizeGitPath(input.folder)
  if (!folder || folder.split('/').some((part) => part === '.gitkeep')) {
    throw new UserError('Media folder name is invalid')
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
  await invalidate([markerPath], result.revision)
  return result
}

export async function deleteMedia(
  input: MediaInput & {
    user: RepositoryUser & { name: string }
    path: string
    sha: string
  },
) {
  const { configuration, schema, storage, invalidate } = await context(input)
  const path = mediaDirectoryPath(schema, input.path)
  if (!allowedExtension(schema, path)) throw new UserError('Invalid media path')
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
  await invalidate([path], result.revision)
  return result
}

type MediaMoveInput = MediaInput & {
  user: RepositoryUser & { name: string }
  path: string
  sha: string
  authorizeMove: (path: string, newPath: string) => Promise<void>
}

async function applyMediaMove(
  input: MediaMoveInput,
  {
    configuration,
    schema,
    storage,
    invalidate,
  }: Awaited<ReturnType<typeof context>>,
  path: string,
  newPath: string,
) {
  await input.authorizeMove(path, newPath)
  const commit = commitOptions(schema)
  const identity = resolveCommitIdentity({
    configuration: configuration.object,
    identityOverride: commit.identity,
  })
  const result = await storage
    .move({
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
    .catch(async (error: unknown) => {
      if (
        isRepositoryProviderError(error, 404, 409) ||
        error instanceof MediaNotFoundError
      )
        await invalidate([path, newPath])
      throw error
    })
  await invalidate([path, newPath], result.revision)
  return result
}

export async function renameMediaFile(
  input: MediaMoveInput & { filename: string },
) {
  const media = await context(input)
  const { schema } = media
  const path = mediaDirectoryPath(schema, input.path)
  if (!allowedExtension(schema, path)) throw new UserError('Invalid media path')
  const filename = normalizeGitPath(input.filename.trim())
  if (!filename || filename.includes('/')) {
    throw new UserError('Media filename must be a non-empty file name')
  }
  const separator = path.lastIndexOf('/')
  const parent = separator === -1 ? '' : path.slice(0, separator)
  const newPath = mediaDirectoryPath(
    schema,
    normalizeGitPath(parent ? `${parent}/${filename}` : filename),
  )
  if (!allowedExtension(schema, newPath)) {
    throw new UserError('This file extension is not allowed')
  }
  if (newPath === path) throw new UserError('The filename has not changed')
  return applyMediaMove(input, media, path, newPath)
}

export async function moveMediaFile(
  input: MediaMoveInput & { destination: string },
) {
  const media = await context(input)
  const { schema } = media
  const path = mediaDirectoryPath(schema, input.path)
  if (!allowedExtension(schema, path)) throw new UserError('Invalid media path')
  const destination = mediaDirectoryPath(schema, input.destination)
  const filename = path.split('/').at(-1)
  if (!filename) throw new UserError('Invalid media path')
  const newPath = mediaDirectoryPath(
    schema,
    normalizeGitPath(destination ? `${destination}/${filename}` : filename),
  )
  if (newPath === path)
    throw new UserError('The file is already in this folder')
  return applyMediaMove(input, media, path, newPath)
}
