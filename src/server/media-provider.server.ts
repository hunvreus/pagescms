import { getFileExtension } from '#/lib/file-types'
import { decodeBase64Bytes } from '#/lib/media-assets'

import type { GitHubApi, GitHubDirectoryEntry } from './github-api.server'
import type { Clock } from './runtime-ports.server'

import { systemClock } from './runtime-ports.server'

export type MediaAssetKind = 'directory' | 'file'

export interface MediaAsset {
  id: string
  kind: MediaAssetKind
  name: string
  path: string
  sha: string | null
  size: number | null
  contentType: string | null
}

export interface MediaManifest {
  provider: string
  directory: string
  assets: MediaAsset[]
}

export interface MediaOrigin {
  assetId: string
  path: string
  url: string
  expiresAt: string | null
  cacheKey: string
}

export interface MediaDeliveryLease {
  assetId: string
  path: string
  url: string
  expiresAt: string | null
  cacheKey: string
}

export interface MediaStoredFile {
  version: string
  bytes: Uint8Array
}

export interface MediaMutationMetadata {
  message: string
  actor?: { name: string; email: string }
}

export interface MediaMutationResult {
  path: string
  version: string | null
  revision: string | null
}

export interface MediaStorageCapabilities {
  createDirectory: boolean
  directUpload: boolean
  upload: boolean
  move: boolean
  rename: boolean
  remove: boolean
}

export interface MediaUploadPart {
  number: number
  url: string
}

export type MediaDirectUploadPlan =
  | Readonly<{
      kind: 'post'
      ticket: string
      url: string
      fields: Readonly<Record<string, string>>
      expiresAt: string
    }>
  | Readonly<{
      kind: 'multipart'
      ticket: string
      partSize: number
      parts: readonly MediaUploadPart[]
      expiresAt: string
    }>

export interface MediaDirectUpload {
  initiate: (input: {
    path: string
    size: number
    contentType: string
    metadata: MediaMutationMetadata
    reservationId: string
  }) => Promise<MediaDirectUploadPlan>
  complete: (input: {
    ticket: string
    parts?: readonly { number: number; etag: string }[]
  }) => Promise<{
    result: MediaMutationResult
    reservationId: string
  }>
  abort: (input: { ticket: string }) => Promise<{
    path: string
    reservationId: string
  }>
}

export interface MediaStorage {
  id: string
  capabilities: MediaStorageCapabilities
  directUpload?: MediaDirectUpload
  list: (directory: string) => Promise<MediaManifest>
  resolveOrigins: (paths: string[]) => Promise<MediaOrigin[]>
  read: (path: string) => Promise<MediaStoredFile>
  write: (input: {
    path: string
    content: string
    metadata: MediaMutationMetadata
  }) => Promise<MediaMutationResult>
  createDirectory: (input: {
    path: string
    metadata: MediaMutationMetadata
  }) => Promise<MediaMutationResult>
  remove: (input: {
    path: string
    version: string
    metadata: MediaMutationMetadata
  }) => Promise<MediaMutationResult>
  move: (input: {
    path: string
    destination: string
    version: string
    metadata: MediaMutationMetadata
  }) => Promise<MediaMutationResult>
}

export interface MediaDelivery {
  id: string
  resolve: (origins: MediaOrigin[]) => Promise<MediaDeliveryLease[]>
}

export interface MediaProviderSelection {
  owner: string
  repo: string
  branch: string
  media: {
    name: string
    rootPath: string
    output: string | null
    extensions: string[]
  }
}

export interface MediaProviderResolver {
  resolveStorage: (
    context: MediaProviderSelection,
  ) => MediaStorage | null | undefined
  resolveDelivery: (
    context: MediaProviderSelection,
  ) => MediaDelivery | null | undefined
}

function isStorageCapabilities(
  value: unknown,
): value is MediaStorageCapabilities {
  if (typeof value !== 'object' || value === null) return false
  const capabilities = value as Record<string, unknown>
  return (
    typeof capabilities.createDirectory === 'boolean' &&
    typeof capabilities.directUpload === 'boolean' &&
    typeof capabilities.upload === 'boolean' &&
    typeof capabilities.move === 'boolean' &&
    typeof capabilities.rename === 'boolean' &&
    typeof capabilities.remove === 'boolean'
  )
}

function isStorage(value: unknown): value is MediaStorage {
  if (typeof value !== 'object' || value === null) return false
  const storage = value as Partial<MediaStorage>
  const directUploadValue = (value as Record<string, unknown>).directUpload
  const directUpload =
    typeof directUploadValue === 'object' &&
    directUploadValue !== null &&
    typeof (directUploadValue as Record<string, unknown>).initiate ===
      'function' &&
    typeof (directUploadValue as Record<string, unknown>).complete ===
      'function' &&
    typeof (directUploadValue as Record<string, unknown>).abort === 'function'
  return (
    typeof storage.id === 'string' &&
    isStorageCapabilities(storage.capabilities) &&
    typeof storage.list === 'function' &&
    typeof storage.resolveOrigins === 'function' &&
    typeof storage.read === 'function' &&
    typeof storage.write === 'function' &&
    typeof storage.createDirectory === 'function' &&
    typeof storage.remove === 'function' &&
    typeof storage.move === 'function' &&
    storage.capabilities.directUpload === directUpload
  )
}

function isDelivery(value: unknown): value is MediaDelivery {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as MediaDelivery).id === 'string' &&
    typeof (value as MediaDelivery).resolve === 'function'
  )
}

export function resolveMediaProvider({
  resolver,
  selection,
  fallbackStorage,
  fallbackDelivery,
}: {
  resolver?: MediaProviderResolver
  selection: MediaProviderSelection
  fallbackStorage: MediaStorage
  fallbackDelivery: MediaDelivery
}) {
  const storage = resolver?.resolveStorage(selection) ?? fallbackStorage
  const delivery = resolver?.resolveDelivery(selection) ?? fallbackDelivery
  if (!isStorage(storage)) throw new Error('Invalid media storage provider')
  if (!isDelivery(delivery)) throw new Error('Invalid media delivery provider')
  return { storage, delivery }
}

function contentType(path: string) {
  switch (getFileExtension(path).toLowerCase()) {
    case 'avif':
      return 'image/avif'
    case 'gif':
      return 'image/gif'
    case 'jpeg':
    case 'jpg':
      return 'image/jpeg'
    case 'png':
      return 'image/png'
    case 'svg':
      return 'image/svg+xml'
    case 'webp':
      return 'image/webp'
    default:
      return null
  }
}

export function mediaUrlExpiry(url: string, now: Date) {
  const parsed = new URL(url)
  const explicitExpiry = parsed.searchParams.get('se')
  if (explicitExpiry) {
    const timestamp = Date.parse(explicitExpiry)
    if (Number.isFinite(timestamp)) return new Date(timestamp).toISOString()
  }

  const unixExpiry = parsed.searchParams.get('Expires')
  if (unixExpiry && /^\d+$/.test(unixExpiry)) {
    return new Date(Number(unixExpiry) * 1000).toISOString()
  }

  const amazonDate = parsed.searchParams.get('X-Amz-Date')
  const amazonLifetime = parsed.searchParams.get('X-Amz-Expires')
  if (amazonDate && amazonLifetime && /^\d+$/.test(amazonLifetime)) {
    const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(
      amazonDate,
    )
    if (match) {
      const [, year, month, day, hour, minute, second] = match
      const issuedAt = Date.UTC(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour),
        Number(minute),
        Number(second),
      )
      return new Date(issuedAt + Number(amazonLifetime) * 1000).toISOString()
    }
  }

  const temporaryParameters = new Set([
    'token',
    'sig',
    'signature',
    'x-amz-signature',
    'x-goog-signature',
  ])
  const signed = [...parsed.searchParams.keys()].some((key) =>
    temporaryParameters.has(key.toLowerCase()),
  )
  return signed ? new Date(now.getTime() + 5 * 60_000).toISOString() : null
}

export function createGitHubMediaStorage({
  api,
  owner,
  repo,
  branch,
  list,
  resolveDirectory,
  onMutation,
  clock = systemClock,
}: {
  api: GitHubApi
  onMutation?: (
    result: { commitSha: string; parentCommitSha?: string },
    changes: {
      path: string
      removed: boolean
      sourcePath?: string
      sha?: string
    }[],
    knownFiles?: GitHubDirectoryEntry[],
  ) => Promise<void>
  owner: string
  repo: string
  branch: string
  list: (directory: string) => Promise<
    Array<{
      type: 'dir' | 'file'
      name: string
      path: string
      sha: string | null
      size: number | null
    }>
  >
  resolveDirectory?: (directory: string) => Promise<GitHubDirectoryEntry[]>
  clock?: Clock
}): MediaStorage {
  return {
    id: 'github',
    capabilities: {
      createDirectory: true,
      directUpload: false,
      upload: true,
      move: true,
      rename: true,
      remove: true,
    },
    async list(directory) {
      const entries = await list(directory)
      return {
        provider: 'github',
        directory,
        assets: entries.map((entry) => ({
          id: entry.path,
          kind: entry.type === 'dir' ? 'directory' : 'file',
          name: entry.name,
          path: entry.path,
          sha: entry.sha,
          size: entry.size,
          contentType: entry.type === 'file' ? contentType(entry.path) : null,
        })),
      }
    },
    async resolveOrigins(paths) {
      const requested = new Set(paths)
      const directories = new Set(
        paths.map((path) => path.split('/').slice(0, -1).join('/')),
      )
      const results = await Promise.all(
        [...directories].map((directory) =>
          resolveDirectory
            ? resolveDirectory(directory)
            : api.getMediaDirectory(owner, repo, branch, directory),
        ),
      )
      const now = clock.now()
      return results.flatMap((entries) =>
        entries.flatMap((entry): MediaOrigin[] => {
          if (
            entry.type !== 'file' ||
            !requested.has(entry.path) ||
            !entry.downloadUrl
          ) {
            return []
          }
          try {
            const url = new URL(entry.downloadUrl)
            if (url.protocol !== 'https:' && url.protocol !== 'http:') return []
            return [
              {
                assetId: entry.path,
                path: entry.path,
                url: entry.downloadUrl,
                expiresAt: mediaUrlExpiry(entry.downloadUrl, now),
                cacheKey: entry.sha ?? entry.path,
              },
            ]
          } catch {
            return []
          }
        }),
      )
    },
    async read(path) {
      const file = await api.getFile(owner, repo, path, branch)
      return {
        version: file.sha,
        bytes: decodeBase64Bytes(file.content),
      }
    },
    async write({ path, content, metadata }) {
      const result = await api.putFile({
        owner,
        repo,
        branch,
        path,
        content,
        message: metadata.message,
        ...(metadata.actor ? { committer: metadata.actor } : {}),
      })
      const bytes = decodeBase64Bytes(content)
      let text: string | null = null
      try {
        const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
        if (!decoded.includes('\0')) text = decoded
      } catch {
        /* Binary uploads have metadata only, even in a colocated collection. */
      }
      await onMutation?.(
        result,
        [{ path, removed: false }],
        [
          {
            path,
            name: path.slice(path.lastIndexOf('/') + 1),
            type: 'file',
            sha: result.sha,
            size: bytes.byteLength,
            content: text,
            downloadUrl: null,
          },
        ],
      )
      return {
        path: result.path,
        version: result.sha,
        revision: result.commitSha,
      }
    },
    async createDirectory({ path, metadata }) {
      const marker = `${path}/.gitkeep`
      const result = await api.putFile({
        owner,
        repo,
        branch,
        path: marker,
        content: '',
        message: metadata.message,
        ...(metadata.actor ? { committer: metadata.actor } : {}),
      })
      await onMutation?.(
        result,
        [{ path: marker, removed: false }],
        [
          {
            path: marker,
            name: '.gitkeep',
            type: 'file',
            sha: result.sha,
            content: '',
            size: 0,
            downloadUrl: null,
          },
        ],
      )
      return {
        path,
        version: null,
        revision: result.commitSha,
      }
    },
    async remove({ path, version, metadata }) {
      const result = await api.deleteFile({
        owner,
        repo,
        branch,
        path,
        sha: version,
        message: metadata.message,
        ...(metadata.actor ? { committer: metadata.actor } : {}),
      })
      await onMutation?.(result, [{ path, removed: true }])
      return { path, version: null, revision: result.commitSha }
    },
    async move({ path, destination, version, metadata }) {
      const result = await api.renameFile({
        owner,
        repo,
        branch,
        path,
        newPath: destination,
        sha: version,
        message: metadata.message,
        ...(metadata.actor ? { committer: metadata.actor } : {}),
      })
      await onMutation?.(result, [
        { path, removed: true },
        {
          path: destination,
          removed: false,
          sourcePath: path,
          sha: result.sha,
        },
      ])
      return {
        path: result.newPath,
        version: result.sha,
        revision: result.commitSha,
      }
    },
  }
}

export function createDirectMediaDelivery(): MediaDelivery {
  return {
    id: 'direct',
    async resolve(origins) {
      return origins.map((origin) => ({ ...origin }))
    },
  }
}
