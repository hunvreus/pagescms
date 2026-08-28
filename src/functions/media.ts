import { createServerFn } from '@tanstack/react-start'

import { base64ByteLength } from '#/lib/base64'
import { normalizeGitPath } from '#/lib/git-path'
import { repositoryRef } from '#/lib/repository'
import { resolveRepositoryPrincipal } from '#/server/repository-policy.server'

import type { ProjectUser } from '#/server/projects.server'
import type { RequestServices } from '#/server/request-services.server'

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
    ...repositoryRef({ owner: value.owner, repo: value.repo }),
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

function parseUpload(input: unknown) {
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

function parseDelete(input: unknown) {
  const media = parseMediaRequest(input)
  const value = input as Record<string, unknown>
  if (!media.path || typeof value.sha !== 'string' || !value.sha) {
    throw new Error('Invalid media deletion')
  }
  return { ...media, path: media.path, sha: value.sha }
}

export function parseMediaRename(input: unknown) {
  const media = parseDelete(input)
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
  const media = parseDelete(input)
  const value = input as Record<string, unknown>
  if (typeof value.destination !== 'string') {
    throw new Error('Invalid media move')
  }
  const destination = normalizeGitPath(value.destination.trim())
  return { ...media, destination }
}

async function policy(
  data: ReturnType<typeof parseMediaRequest>,
  operation: 'media.read' | 'media.write' | 'media.rename' | 'media.delete',
  services: RequestServices,
  user: ProjectUser,
) {
  return {
    operation,
    principal: await resolveRepositoryPrincipal(
      services.repositoryAccess,
      user,
      data,
    ),
    tenant: {
      type: 'repository' as const,
      id: `${data.owner}/${data.repo}`.toLowerCase(),
    },
    target: {
      repository: data,
      branch: data.branch,
      media: data.name,
      ...(data.path ? { path: data.path } : {}),
    },
    ...('size' in data && typeof data.size === 'number'
      ? { facts: { bytes: data.size } }
      : 'content' in data && typeof data.content === 'string'
        ? { facts: { bytes: base64ByteLength(data.content) } }
        : {}),
  }
}

export const getMedia = createServerFn({ method: 'GET' })
  .validator(parseMediaRequest)
  .handler(async ({ context, data }) => {
    const services = context.getServices()
    const session = await services.getSession()
    if (!session?.user) throw new Error('Authentication required')
    const user = {
      id: session.user.id,
      email: session.user.email,
      githubUsername: session.user.githubUsername ?? null,
    }
    return services.access.execute(
      await policy(data, 'media.read', services, user),
      async () => {
        const { loadMediaDirectory } =
          await import('#/server/media-service.server')
        return loadMediaDirectory({
          database: services.database,
          mediaProviderResolver: services.mediaProviderResolver,
          repositoryAccess: services.repositoryAccess,
          user,
          ...data,
        })
      },
    )
  })

export const getMediaDelivery = createServerFn({ method: 'POST' })
  .validator(parseMediaDeliveryRequest)
  .handler(async ({ context, data }) => {
    const services = context.getServices()
    const session = await services.getSession()
    if (!session?.user) throw new Error('Authentication required')
    const user = {
      id: session.user.id,
      email: session.user.email,
      githubUsername: session.user.githubUsername ?? null,
    }
    return services.access.execute(
      await policy(data, 'media.read', services, user),
      async () => {
        const { loadMediaDelivery } =
          await import('#/server/media-service.server')
        return loadMediaDelivery({
          database: services.database,
          mediaProviderResolver: services.mediaProviderResolver,
          repositoryAccess: services.repositoryAccess,
          user,
          ...data,
        })
      },
    )
  })

export const createMedia = createServerFn({ method: 'POST' })
  .validator(parseUpload)
  .handler(async ({ context, data }) => {
    const services = context.getServices()
    const session = await services.getSession()
    if (!session?.user) throw new Error('Authentication required')
    const user = {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      githubUsername: session.user.githubUsername ?? null,
    }
    return services.access.executeQuota(
      await policy(data, 'media.write', services, user),
      data.idempotencyKey,
      async () => {
        const { uploadMedia } = await import('#/server/media-service.server')
        return uploadMedia({
          database: services.database,
          mediaProviderResolver: services.mediaProviderResolver,
          repositoryAccess: services.repositoryAccess,
          user,
          ...data,
        })
      },
    )
  })

export const initiateMediaUpload = createServerFn({ method: 'POST' })
  .validator(parseMediaUploadInitiation)
  .handler(async ({ context, data }) => {
    const services = context.getServices()
    const session = await services.getSession()
    if (!session?.user) throw new Error('Authentication required')
    const user = {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      githubUsername: session.user.githubUsername ?? null,
    }
    const request = await policy(data, 'media.write', services, user)
    await services.access.authorize(request)
    const { prepareMediaUpload } = await import('#/server/media-service.server')
    const prepared = await prepareMediaUpload({
      database: services.database,
      mediaProviderResolver: services.mediaProviderResolver,
      repositoryAccess: services.repositoryAccess,
      user,
      ...data,
    })
    if (!prepared.direct) return { kind: 'server' as const }

    const reservation = await services.access.reserveQuota(
      request,
      data.idempotencyKey,
    )
    try {
      return {
        kind: 'direct' as const,
        path: prepared.path,
        plan: await prepared.direct(reservation.id),
      }
    } catch (error) {
      try {
        await services.access.settleQuota(reservation, 'released')
      } catch {
        // Preserve the storage failure; the policy reconciles reservations.
      }
      throw error
    }
  })

export const confirmMediaUpload = createServerFn({ method: 'POST' })
  .validator(parseMediaUploadCompletion)
  .handler(async ({ context, data }) => {
    const services = context.getServices()
    const session = await services.getSession()
    if (!session?.user) throw new Error('Authentication required')
    const user = {
      id: session.user.id,
      email: session.user.email,
      githubUsername: session.user.githubUsername ?? null,
    }
    return services.access.execute(
      await policy(data, 'media.write', services, user),
      async () => {
        const { completeMediaUpload } =
          await import('#/server/media-service.server')
        const completed = await completeMediaUpload({
          database: services.database,
          mediaProviderResolver: services.mediaProviderResolver,
          repositoryAccess: services.repositoryAccess,
          user,
          ...data,
        })
        await services.access.settleQuota(
          { id: completed.reservationId },
          'committed',
        )
        return completed.result
      },
    )
  })

export const abortMediaUpload = createServerFn({ method: 'POST' })
  .validator(parseMediaUploadAbort)
  .handler(async ({ context, data }) => {
    const services = context.getServices()
    const session = await services.getSession()
    if (!session?.user) throw new Error('Authentication required')
    const user = {
      id: session.user.id,
      email: session.user.email,
      githubUsername: session.user.githubUsername ?? null,
    }
    return services.access.execute(
      await policy(data, 'media.write', services, user),
      async () => {
        const { abortMediaUpload: abort } =
          await import('#/server/media-service.server')
        const aborted = await abort({
          database: services.database,
          mediaProviderResolver: services.mediaProviderResolver,
          repositoryAccess: services.repositoryAccess,
          user,
          ...data,
        })
        await services.access.settleQuota(
          { id: aborted.reservationId },
          'released',
        )
        return { path: aborted.path }
      },
    )
  })

export const createMediaFolder = createServerFn({ method: 'POST' })
  .validator(parseMediaFolderCreate)
  .handler(async ({ context, data }) => {
    const services = context.getServices()
    const session = await services.getSession()
    if (!session?.user) throw new Error('Authentication required')
    const user = {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      githubUsername: session.user.githubUsername ?? null,
    }
    return services.access.execute(
      await policy(data, 'media.write', services, user),
      async () => {
        const { createMediaDirectory } =
          await import('#/server/media-service.server')
        return createMediaDirectory({
          database: services.database,
          mediaProviderResolver: services.mediaProviderResolver,
          repositoryAccess: services.repositoryAccess,
          user,
          ...data,
        })
      },
    )
  })

export const removeMedia = createServerFn({ method: 'POST' })
  .validator(parseDelete)
  .handler(async ({ context, data }) => {
    const services = context.getServices()
    const session = await services.getSession()
    if (!session?.user) throw new Error('Authentication required')
    const user = {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      githubUsername: session.user.githubUsername ?? null,
    }
    return services.access.execute(
      await policy(data, 'media.delete', services, user),
      async () => {
        const { deleteMedia } = await import('#/server/media-service.server')
        return deleteMedia({
          database: services.database,
          mediaProviderResolver: services.mediaProviderResolver,
          repositoryAccess: services.repositoryAccess,
          user,
          ...data,
        })
      },
    )
  })

export const renameMedia = createServerFn({ method: 'POST' })
  .validator(parseMediaRename)
  .handler(async ({ context, data }) => {
    const services = context.getServices()
    const session = await services.getSession()
    if (!session?.user) throw new Error('Authentication required')
    const user = {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      githubUsername: session.user.githubUsername ?? null,
    }
    return services.access.execute(
      await policy(data, 'media.rename', services, user),
      async () => {
        const { renameMediaFile } =
          await import('#/server/media-service.server')
        return renameMediaFile({
          database: services.database,
          mediaProviderResolver: services.mediaProviderResolver,
          repositoryAccess: services.repositoryAccess,
          user,
          ...data,
        })
      },
    )
  })

export const moveMedia = createServerFn({ method: 'POST' })
  .validator(parseMediaMove)
  .handler(async ({ context, data }) => {
    const services = context.getServices()
    const session = await services.getSession()
    if (!session?.user) throw new Error('Authentication required')
    const user = {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      githubUsername: session.user.githubUsername ?? null,
    }
    return services.access.execute(
      await policy(data, 'media.rename', services, user),
      async () => {
        const { moveMediaFile } = await import('#/server/media-service.server')
        return moveMediaFile({
          database: services.database,
          mediaProviderResolver: services.mediaProviderResolver,
          repositoryAccess: services.repositoryAccess,
          user,
          ...data,
        })
      },
    )
  })
