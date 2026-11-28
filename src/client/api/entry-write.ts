import type * as operations from '#/server/services/content'
import { parseEntryRenamePlan } from '#/shared/requests/entry-write'
import { apiMutation, readApi } from '#/client/api/index'

export const updateRawEntry = apiMutation<
  unknown,
  Awaited<ReturnType<typeof operations.saveRawEntry>>
>('/api/entries/raw', 'PATCH')
export const updateStructuredEntry = apiMutation<
  unknown,
  Awaited<ReturnType<typeof operations.saveStructuredEntry>>
>('/api/entries/structured', 'PATCH')
export const createRawCollectionEntry = apiMutation<
  unknown,
  Awaited<ReturnType<typeof operations.createRawEntry>>
>('/api/entries/raw')
export const createStructuredCollectionEntry = apiMutation<
  unknown,
  Awaited<ReturnType<typeof operations.createStructuredEntry>>
>('/api/entries/structured')
export const createCollectionFolder = apiMutation<
  unknown,
  Awaited<ReturnType<typeof operations.createCollectionFolder>>
>('/api/entry-folders')
export const deleteEntry = apiMutation<
  unknown,
  Awaited<ReturnType<typeof operations.deleteEntry>>
>('/api/entries', 'DELETE')
export const renameEntry = apiMutation<
  unknown,
  Awaited<ReturnType<typeof operations.renameEntry>>
>('/api/entries/name', 'PATCH')
export const moveEntry = apiMutation<
  unknown,
  Awaited<ReturnType<typeof operations.moveEntry>>
>('/api/entries/path', 'PATCH')

export function getEntryRenamePlan(
  input: unknown,
): ReturnType<typeof operations.planEntryRename> {
  const data = parseEntryRenamePlan(input)
  const params = new URLSearchParams({
    owner: data.owner,
    repo: data.repo,
    branch: data.branch,
    name: data.name,
    path: data.path,
    sha: data.sha,
  })
  if (data.repoId) params.set('repoId', data.repoId)
  if (data.filename !== undefined) params.set('filename', data.filename)
  if (data.newPath !== undefined) params.set('newPath', data.newPath)
  return readApi(`/api/entries/rename-plan?${params}`)
}
