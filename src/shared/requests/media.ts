import { normalizeGitPath } from '#/shared/git-path'
import { repositoryRef } from '#/lib/repository'
import { parseMediaVariant } from '#/lib/media-variants'
import { parseUploadRename } from '#/lib/media-upload-name'

export function parseMediaRequest(input: unknown) {
  if (typeof input !== 'object' || input === null) {
    throw new Error('Invalid media request')
  }
  const value = input as Record<string, unknown>
  if (
    typeof value.owner !== 'string' ||
    typeof value.repo !== 'string' ||
    typeof value.branch !== 'string' ||
    !value.branch ||
    typeof value.name !== 'string' ||
    !value.name ||
    value.name.includes('/')
  ) {
    throw new Error('Invalid media request')
  }
  return {
    ...repositoryRef({
      owner: value.owner,
      repo: value.repo,
      repoId: value.repoId,
    }),
    branch: value.branch,
    name: value.name,
    ...(typeof value.path === 'string' && value.path
      ? { path: normalizeGitPath(value.path) }
      : {}),
  }
}

export function parseMediaDeliveryRequest(input: unknown) {
  const media = parseMediaRequest(input)
  const value = input as Record<string, unknown>
  if (
    !Array.isArray(value.paths) ||
    value.paths.length === 0 ||
    value.paths.length > 1000 ||
    value.paths.some((path) => typeof path !== 'string' || !path)
  ) {
    throw new Error('Invalid media delivery request')
  }
  return {
    ...media,
    paths: value.paths.map((path) => normalizeGitPath(path as string)),
    forceRefresh: value.forceRefresh === true,
    variant: parseMediaVariant(value.variant),
  }
}

export function parseMediaFolderCreate(input: unknown) {
  const media = parseMediaRequest(input)
  const value = input as Record<string, unknown>
  if (typeof value.folder !== 'string') {
    throw new Error('Invalid media folder creation')
  }
  const folder = normalizeGitPath(value.folder.trim())
  if (!folder || folder.split('/').some((part) => part === '.gitkeep')) {
    throw new Error('Media folder name is invalid')
  }
  return {
    ...media,
    parent: media.path,
    folder,
  }
}

export function parseMediaUpload(input: unknown) {
  const media = parseMediaRequest(input)
  const value = input as Record<string, unknown>
  if (
    typeof value.filename !== 'string' ||
    typeof value.content !== 'string' ||
    typeof value.idempotencyKey !== 'string' ||
    !value.idempotencyKey ||
    value.idempotencyKey.length > 200
  ) {
    throw new Error('Invalid media upload')
  }
  return {
    ...media,
    filename: value.filename,
    content: value.content,
    rename: parseUploadRename(value.rename),
    idempotencyKey: value.idempotencyKey,
    ...(media.path ? { parent: media.path } : {}),
  }
}

export function parseMediaUploadInitiation(input: unknown) {
  const media = parseMediaRequest(input)
  const value = input as Record<string, unknown>
  if (
    typeof value.filename !== 'string' ||
    typeof value.size !== 'number' ||
    !Number.isSafeInteger(value.size) ||
    value.size < 0 ||
    typeof value.contentType !== 'string' ||
    !value.contentType ||
    value.contentType.length > 200 ||
    typeof value.idempotencyKey !== 'string' ||
    !value.idempotencyKey ||
    value.idempotencyKey.length > 200
  ) {
    throw new Error('Invalid media upload initiation')
  }
  return {
    ...media,
    filename: value.filename,
    size: value.size,
    rename: parseUploadRename(value.rename),
    contentType: value.contentType,
    idempotencyKey: value.idempotencyKey,
    ...(media.path ? { parent: media.path } : {}),
  }
}

export function parseMediaUploadCompletion(input: unknown) {
  const media = parseMediaRequest(input)
  const value = input as Record<string, unknown>
  if (!media.path || typeof value.ticket !== 'string' || !value.ticket) {
    throw new Error('Invalid media upload completion')
  }
  const parts = value.parts
  if (
    parts !== undefined &&
    (!Array.isArray(parts) ||
      parts.length === 0 ||
      parts.length > 10_000 ||
      parts.some((part) => {
        if (typeof part !== 'object' || part === null) return true
        const item = part as Record<string, unknown>
        return (
          typeof item.number !== 'number' ||
          !Number.isSafeInteger(item.number) ||
          item.number <= 0 ||
          typeof item.etag !== 'string' ||
          !item.etag ||
          item.etag.length > 512
        )
      }))
  ) {
    throw new Error('Invalid media upload completion')
  }
  return {
    ...media,
    path: media.path,
    ticket: value.ticket,
    ...(Array.isArray(parts)
      ? {
          parts: parts.map((part) => {
            const item = part as { number: number; etag: string }
            return { number: item.number, etag: item.etag }
          }),
        }
      : {}),
  }
}

export function parseMediaUploadAbort(input: unknown) {
  const completed = parseMediaUploadCompletion(input)
  return {
    owner: completed.owner,
    repo: completed.repo,
    branch: completed.branch,
    name: completed.name,
    path: completed.path,
    ticket: completed.ticket,
  }
}

export function parseMediaDelete(input: unknown) {
  const media = parseMediaRequest(input)
  const value = input as Record<string, unknown>
  if (!media.path || typeof value.sha !== 'string' || !value.sha) {
    throw new Error('Invalid media deletion')
  }
  return { ...media, path: media.path, sha: value.sha }
}

export function parseMediaRename(input: unknown) {
  const media = parseMediaDelete(input)
  const value = input as Record<string, unknown>
  if (typeof value.filename !== 'string') {
    throw new Error('Invalid media rename')
  }
  const filename = normalizeGitPath(value.filename.trim())
  if (!filename || filename.includes('/')) {
    throw new Error('Media filename must be a non-empty file name')
  }
  return { ...media, filename }
}

export function parseMediaMove(input: unknown) {
  const media = parseMediaDelete(input)
  const value = input as Record<string, unknown>
  if (typeof value.destination !== 'string') {
    throw new Error('Invalid media move')
  }
  const destination = normalizeGitPath(value.destination.trim())
  return { ...media, destination }
}
