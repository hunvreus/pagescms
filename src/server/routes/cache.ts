import { Hono } from 'hono/quick'
import type { ApiEnvironment } from './shared'
import { validatedRead, validatedWrite } from './shared'
import {
  coordinates as cacheCoordinates,
  managementRequest as cacheManagementRequest,
  filesRequest as cacheFilesRequest,
} from '#/shared/requests/cache'
import {
  readCacheStatus,
  manageRepositoryCache,
  readCacheFiles,
} from '#/server/services/cache'

const router = new Hono<ApiEnvironment>()

router.get(
  '/api/cache/status',
  validatedRead(cacheCoordinates, readCacheStatus),
)

router.patch(
  '/api/cache',
  validatedWrite(cacheManagementRequest, manageRepositoryCache),
)

router.get(
  '/api/cache/files',
  validatedRead((input) => {
    const query = input as Record<string, string | undefined>
    return cacheFilesRequest({
      ...query,
      page:
        query.page === undefined || !/^\d+$/.test(query.page)
          ? NaN
          : Number(query.page),
    })
  }, readCacheFiles),
)

export default router
