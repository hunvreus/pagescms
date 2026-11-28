import {
  abortMediaUpload as abort,
  completeMediaUpload,
  createMediaDirectory,
  deleteMedia,
  loadMediaDelivery,
  loadMediaDirectory,
  moveMediaFile,
  prepareMediaUpload,
  renameMediaFile,
  uploadMedia,
} from '#/server/media/media'
import type { MediaVariant } from '#/lib/media-variants'
import type {
  parseMediaUploadInitiation,
  parseMediaUploadCompletion,
  parseMediaUploadAbort,
  parseMediaFolderCreate,
  parseMediaRename,
  parseMediaMove,
} from '#/shared/requests/media'
import { normalizeGitPath } from '#/shared/git-path'
import { base64ByteLength } from '#/lib/base64'
import { resolveRepositoryPrincipal } from '#/server/access/repository-policy'
import { repositoryTenant } from '#/server/services/context'

import type { AccessRequest } from '#/server/access/policy'
import type { RepositoryUser } from '#/server/repository/repositories'
import type { UploadRename } from '#/lib/media-upload-name'
import type { ServiceContext, ServiceUser } from '#/server/services/context'

export type MediaOperationInput = {
  owner: string
  repo: string
  repoId?: string
  branch: string
  name: string
  path?: string
}

type MediaUploadFields = {
  filename: string
  parent?: string
  rename?: UploadRename
}

export type MediaAccessInput =
  | MediaOperationInput
  | (MediaOperationInput &
      MediaUploadFields &
      ({ content: string } | { size: number; contentType: string }))

async function sha256Hex(value: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
    ),
  )
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

/** Check both ends after schema confinement and before the storage mutation. */
export function mediaMoveAuthorizer(
  access: Pick<ServiceContext['access'], 'authorize'>,
  request: AccessRequest,
) {
  return async (path: string, newPath: string) => {
    const source = normalizeGitPath(path)
    const destination = normalizeGitPath(newPath)
    const facts = { ...request.facts, newPath: destination }
    await access.authorize({
      ...request,
      target: { ...request.target, path: source },
      facts,
    })
    await access.authorize({
      ...request,
      target: { ...request.target, path: destination },
      facts,
    })
  }
}

export async function mediaAccessRequest(
  data: MediaAccessInput,
  operation: 'media.read' | 'media.write' | 'media.rename' | 'media.delete',
  services: Pick<ServiceContext, 'repositoryAccess'> &
    Partial<Pick<ServiceContext, 'access'>>,
  user: RepositoryUser,
): Promise<AccessRequest> {
  const uploadBinding =
    'filename' in data
      ? JSON.stringify({
          filename: data.filename,
          parent: 'parent' in data ? data.parent : null,
          rename: 'rename' in data ? data.rename : null,
          contentType: 'contentType' in data ? data.contentType : null,
        })
      : undefined
  const contentDigest =
    services.access?.hasPolicy !== false &&
    !('size' in data) &&
    'content' in data
      ? await sha256Hex(data.content)
      : undefined
  return {
    operation,
    principal: await resolveRepositoryPrincipal(
      services.repositoryAccess,
      user,
      data,
    ),
    tenant: repositoryTenant(data),
    target: {
      repository: data,
      branch: data.branch,
      media: data.name,
      ...(data.path !== undefined ? { path: normalizeGitPath(data.path) } : {}),
    },
    ...('variant' in data ? { facts: { variant: String(data.variant) } } : {}),
    ...('size' in data && typeof data.size === 'number'
      ? {
          facts: {
            bytes: data.size,
            ...(uploadBinding ? { uploadBinding } : {}),
          },
        }
      : 'content' in data && typeof data.content === 'string'
        ? {
            facts: {
              bytes: base64ByteLength(data.content),
              ...(uploadBinding ? { uploadBinding } : {}),
              ...(contentDigest ? { contentDigest } : {}),
            },
          }
        : {}),
  }
}

export async function readMediaDirectory(
  services: ServiceContext,
  user: ServiceUser,
  data: MediaOperationInput,
) {
  data = {
    ...data,
    path: data.path === undefined ? undefined : normalizeGitPath(data.path),
  }
  return services.access.execute(
    await mediaAccessRequest(data, 'media.read', services, user),
    async () => {
      return loadMediaDirectory({
        database: services.cacheDatabase,
        identityDatabase: services.database,
        mediaProviderResolver: services.mediaProviderResolver,
        repositoryAccess: services.repositoryAccess,
        user,
        ...data,
      })
    },
  )
}

export async function readMediaDelivery(
  services: ServiceContext,
  user: ServiceUser,
  data: MediaOperationInput & {
    paths: string[]
    forceRefresh?: boolean
    variant?: MediaVariant
  },
) {
  data = {
    ...data,
    path: data.path === undefined ? undefined : normalizeGitPath(data.path),
    paths: data.paths.map(normalizeGitPath),
  }
  const request = await mediaAccessRequest(data, 'media.read', services, user)
  return services.access.execute(request, async () => {
    if (services.access.hasPolicy !== false) {
      await services.access.authorizeMany(
        data.paths.map((path) => ({
          ...request,
          target: {
            repository: data,
            branch: data.branch,
            media: data.name,
            path,
          },
        })),
      )
    }
    return loadMediaDelivery({
      database: services.cacheDatabase,
      identityDatabase: services.database,
      mediaProviderResolver: services.mediaProviderResolver,
      repositoryAccess: services.repositoryAccess,
      user,
      ...data,
    })
  })
}

export async function uploadMediaFile(
  services: ServiceContext,
  user: ServiceUser,
  data: MediaOperationInput & {
    filename: string
    content: string
    rename?: UploadRename
    idempotencyKey: string
    parent?: string
  },
) {
  const parent = data.parent ?? data.path
  data = {
    ...data,
    parent: parent === undefined ? undefined : normalizeGitPath(parent),
    path: parent === undefined ? undefined : normalizeGitPath(parent),
  }
  return services.repositoryAccess.executeMutation(
    user,
    data,
    services.mediaProviderResolver ? 'multi' : 'single',
    async () =>
      services.access.executeQuota(
        await mediaAccessRequest(data, 'media.write', services, user),
        data.idempotencyKey,
        async () => {
          return uploadMedia({
            database: services.cacheDatabase,
            identityDatabase: services.database,
            mediaProviderResolver: services.mediaProviderResolver,
            repositoryAccess: services.repositoryAccess,
            user,
            ...data,
          })
        },
      ),
  )
}

export async function deleteMediaFile(
  services: ServiceContext,
  user: ServiceUser,
  data: MediaOperationInput & { path: string; sha: string },
) {
  data = { ...data, path: normalizeGitPath(data.path) }
  return services.repositoryAccess.executeMutation(
    user,
    data,
    services.mediaProviderResolver ? 'multi' : 'single',
    async () =>
      services.access.execute(
        await mediaAccessRequest(data, 'media.delete', services, user),
        async () => {
          return deleteMedia({
            database: services.cacheDatabase,
            identityDatabase: services.database,
            mediaProviderResolver: services.mediaProviderResolver,
            repositoryAccess: services.repositoryAccess,
            user,
            ...data,
          })
        },
      ),
  )
}

export async function initiateMediaUpload(
  services: ServiceContext,
  user: ServiceUser,
  data: ReturnType<typeof parseMediaUploadInitiation>,
) {
  return services.repositoryAccess.executeMutation(
    user,
    data,
    'multi',
    async () => {
      const request = await mediaAccessRequest(
        data,
        'media.write',
        services,
        user,
      )
      await services.access.authorize(request)
      const prepared = await prepareMediaUpload({
        database: services.cacheDatabase,
        identityDatabase: services.database,
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
          /* Preserve the storage failure. */
        }
        throw error
      }
    },
  )
}

export async function confirmMediaUpload(
  services: ServiceContext,
  user: ServiceUser,
  data: ReturnType<typeof parseMediaUploadCompletion>,
) {
  return services.repositoryAccess.executeMutation(
    user,
    data,
    'multi',
    async () => {
      const request = await mediaAccessRequest(
        data,
        'media.write',
        services,
        user,
      )
      return services.access.execute(
        { ...request, facts: { ...request.facts, activityKey: data.ticket } },
        async () => {
          const completed = await completeMediaUpload({
            database: services.cacheDatabase,
            identityDatabase: services.database,
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
    },
  )
}

export async function abortMediaUpload(
  services: ServiceContext,
  user: ServiceUser,
  data: ReturnType<typeof parseMediaUploadAbort>,
) {
  return services.repositoryAccess.executeMutation(
    user,
    data,
    'multi',
    async () =>
      services.access.execute(
        await mediaAccessRequest(data, 'media.write', services, user),
        async () => {
          const aborted = await abort({
            database: services.cacheDatabase,
            identityDatabase: services.database,
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
      ),
  )
}

export async function createMediaFolder(
  services: ServiceContext,
  user: ServiceUser,
  data: ReturnType<typeof parseMediaFolderCreate>,
) {
  return services.repositoryAccess.executeMutation(
    user,
    data,
    services.mediaProviderResolver ? 'multi' : 'single',
    async () =>
      services.access.execute(
        await mediaAccessRequest(data, 'media.write', services, user),
        async () => {
          return createMediaDirectory({
            database: services.cacheDatabase,
            identityDatabase: services.database,
            mediaProviderResolver: services.mediaProviderResolver,
            repositoryAccess: services.repositoryAccess,
            user,
            ...data,
          })
        },
      ),
  )
}

export async function renameMedia(
  services: ServiceContext,
  user: ServiceUser,
  data: ReturnType<typeof parseMediaRename>,
) {
  return services.repositoryAccess.executeMutation(
    user,
    data,
    'multi',
    async () => {
      const request = await mediaAccessRequest(
        data,
        'media.rename',
        services,
        user,
      )
      return services.access.execute(request, async () => {
        return renameMediaFile({
          database: services.cacheDatabase,
          identityDatabase: services.database,
          mediaProviderResolver: services.mediaProviderResolver,
          repositoryAccess: services.repositoryAccess,
          user,
          ...data,
          authorizeMove: mediaMoveAuthorizer(services.access, request),
        })
      })
    },
  )
}

export async function moveMedia(
  services: ServiceContext,
  user: ServiceUser,
  data: ReturnType<typeof parseMediaMove>,
) {
  return services.repositoryAccess.executeMutation(
    user,
    data,
    'multi',
    async () => {
      const request = await mediaAccessRequest(
        data,
        'media.rename',
        services,
        user,
      )
      return services.access.execute(request, async () => {
        return moveMediaFile({
          database: services.cacheDatabase,
          identityDatabase: services.database,
          mediaProviderResolver: services.mediaProviderResolver,
          repositoryAccess: services.repositoryAccess,
          user,
          ...data,
          authorizeMove: mediaMoveAuthorizer(services.access, request),
        })
      })
    },
  )
}
