import { createServerFn } from '@tanstack/react-start'

import { normalizeGitPath } from '#/lib/git-path'
import { repositoryRef } from '#/lib/repository'

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
  if (typeof value.filename !== 'string' || typeof value.content !== 'string') {
    throw new Error('Invalid media upload')
  }
  return {
    ...media,
    filename: value.filename,
    content: value.content,
    ...(media.path ? { parent: media.path } : {}),
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

function policy(
  data: ReturnType<typeof parseMediaRequest>,
  operation: 'media.read' | 'media.write' | 'media.rename' | 'media.delete',
  userId: string,
) {
  return {
    operation,
    principal: { type: 'user' as const, id: userId },
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
      policy(data, 'media.read', user.id),
      async () => {
        const { loadMediaDirectory } =
          await import('#/server/media-service.server')
        return loadMediaDirectory({
          database: services.database,
          background: services.background,
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
    return services.access.execute(
      policy(data, 'media.write', user.id),
      async () => {
        const { uploadMedia } = await import('#/server/media-service.server')
        return uploadMedia({
          database: services.database,
          background: services.background,
          repositoryAccess: services.repositoryAccess,
          user,
          ...data,
        })
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
      policy(data, 'media.write', user.id),
      async () => {
        const { createMediaDirectory } =
          await import('#/server/media-service.server')
        return createMediaDirectory({
          database: services.database,
          background: services.background,
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
      policy(data, 'media.delete', user.id),
      async () => {
        const { deleteMedia } = await import('#/server/media-service.server')
        return deleteMedia({
          database: services.database,
          background: services.background,
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
      policy(data, 'media.rename', user.id),
      async () => {
        const { renameMediaFile } =
          await import('#/server/media-service.server')
        return renameMediaFile({
          database: services.database,
          background: services.background,
          repositoryAccess: services.repositoryAccess,
          user,
          ...data,
        })
      },
    )
  })
