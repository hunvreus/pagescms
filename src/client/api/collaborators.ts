import type {
  readCollaborators as list,
  addCollaborators as add,
  deleteCollaborator as remove,
} from '#/server/services/collaborators'
import { apiMutation, apiQuery } from '#/client/api/index'

export const getCollaborators: (
  input: Parameters<typeof list>[2],
) => ReturnType<typeof list> = (input) => apiQuery('/api/collaborators', input)
export const addCollaborators = apiMutation<
  unknown,
  Awaited<ReturnType<typeof add>>
>('/api/collaborators')
export const deleteCollaborator = apiMutation<
  unknown,
  Awaited<ReturnType<typeof remove>>
>('/api/collaborators', 'DELETE')
