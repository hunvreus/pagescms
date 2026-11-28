import { Hono } from 'hono/quick'
import type { ApiEnvironment } from './shared'
import { pagedQuery, validatedRead } from './shared'
import { parseActivityRequest } from '#/shared/requests/activity'
import { readActivity } from '#/server/services/activity'

const router = new Hono<ApiEnvironment>()

router.get(
  '/api/activity',
  validatedRead(
    (query) => parseActivityRequest(pagedQuery(query)),
    readActivity,
  ),
)

export default router
