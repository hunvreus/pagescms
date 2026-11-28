import type { readMediaDirectory as getMedia } from '#/server/services/media'
import { apiMutation, readApi } from '#/client/api/index'
import type * as operations from '#/server/services/media'

type Input = {
  owner: string
  repo: string
  repoId?: string
  branch: string
  name: string
  path?: string
}

export async function readMedia(input: Input): ReturnType<typeof getMedia> {
  const params = new URLSearchParams({
    owner: input.owner,
    repo: input.repo,
    branch: input.branch,
    name: input.name,
  })
  if (input.repoId) params.set('repoId', input.repoId)
  if (input.path) params.set('path', input.path)
  return readApi(`/api/media?${params}`)
}

export const getMediaDelivery = apiMutation<
  unknown,
  Awaited<ReturnType<typeof operations.readMediaDelivery>>
>('/api/media/delivery')

export const createMedia = apiMutation<
  unknown,
  Awaited<ReturnType<typeof operations.uploadMediaFile>>
>('/api/media/files')
export const initiateMediaUpload = apiMutation<
  unknown,
  Awaited<ReturnType<typeof operations.initiateMediaUpload>>
>('/api/media/uploads')
export const confirmMediaUpload = apiMutation<
  unknown,
  Awaited<ReturnType<typeof operations.confirmMediaUpload>>
>('/api/media/uploads', 'PATCH')
export const abortMediaUpload = apiMutation<
  unknown,
  Awaited<ReturnType<typeof operations.abortMediaUpload>>
>('/api/media/uploads', 'DELETE')
export const createMediaFolder = apiMutation<
  unknown,
  Awaited<ReturnType<typeof operations.createMediaFolder>>
>('/api/media/folders')
export const removeMedia = apiMutation<
  unknown,
  Awaited<ReturnType<typeof operations.deleteMediaFile>>
>('/api/media/files', 'DELETE')
export const renameMedia = apiMutation<
  unknown,
  Awaited<ReturnType<typeof operations.renameMedia>>
>('/api/media/files/name', 'PATCH')
export const moveMedia = apiMutation<
  unknown,
  Awaited<ReturnType<typeof operations.moveMedia>>
>('/api/media/files/path', 'PATCH')
