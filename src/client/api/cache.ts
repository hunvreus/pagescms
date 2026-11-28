import type {
  readCacheStatus as status,
  manageRepositoryCache,
  readCacheFiles,
} from '#/server/services/cache'
import { apiMutation, apiQuery } from '#/client/api/index'

export const getCacheStatus: (
  input: Parameters<typeof status>[2],
) => ReturnType<typeof status> = (input) => apiQuery('/api/cache/status', input)
export const updateCache = apiMutation<
  unknown,
  Awaited<ReturnType<typeof manageRepositoryCache>>
>('/api/cache', 'PATCH')
export const getCacheFiles = (
  input: unknown,
): Promise<Awaited<ReturnType<typeof readCacheFiles>>> =>
  apiQuery('/api/cache/files', input)
