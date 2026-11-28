import { Hono } from 'hono/quick'
import type { ApiEnvironment } from './shared'
import { appVersion } from '#/server/routes/app-version'
import { first } from '#/server/db/sql'
import type { Database } from '#/server/db/client'
import {
  getRequestId,
  logServerEvent,
  serverErrorDetails,
  withRequestId,
} from '#/server/http'

export async function checkDatabaseReadiness(
  database: Database,
  timeoutMs = 2_000,
) {
  let timeout: ReturnType<typeof setTimeout> | undefined
  const query = first(database, 'SELECT 1', [])
  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(
      () => reject(new Error('Database readiness check timed out')),
      timeoutMs,
    )
  })

  try {
    await Promise.race([query, deadline])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

const router = new Hono<ApiEnvironment>()

router.get('/api/app/version', (context) => appVersion(context.req.raw))

router.get('/api/health', async (context) => {
  const requestId = getRequestId(context.req.raw)
  let dependency = 'application'
  try {
    const services = context.env.getServices()
    dependency = 'database'
    await checkDatabaseReadiness(services.database)
    dependency = 'cacheDatabase'
    await checkDatabaseReadiness(services.cacheDatabase)
    return withRequestId(
      Response.json(
        {
          service: 'pagescms',
          status: 'ok',
          checks: { database: 'ok', cacheDatabase: 'ok' },
        },
        { headers: { 'cache-control': 'no-store' } },
      ),
      requestId,
    )
  } catch (error) {
    logServerEvent('error', {
      event: 'health_check_failed',
      requestId,
      dependency,
      ...serverErrorDetails(error),
    })
    return withRequestId(
      Response.json(
        {
          service: 'pagescms',
          status: 'unavailable',
          checks: { [dependency]: 'unavailable' },
        },
        { status: 503, headers: { 'cache-control': 'no-store' } },
      ),
      requestId,
    )
  }
})

export default router
