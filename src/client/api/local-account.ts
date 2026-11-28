import { apiMutation } from '#/client/api/index'

export const getDeletedLocalAccounts = apiMutation<unknown, string[]>(
  '/api/account/deleted-local',
)
