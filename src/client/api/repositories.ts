import type { copyTemplate } from '#/server/services/dashboard'
import { apiMutation } from '#/client/api/index'

export const copyRepositoryTemplate = apiMutation<
  unknown,
  Awaited<ReturnType<typeof copyTemplate>>
>('/api/repositories')
