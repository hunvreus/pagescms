import { createFileRoute } from '@tanstack/react-router'

import type {} from '@tanstack/react-start'

import { checkDatabaseReadiness } from '#/server/health.server'
import {
  getRequestId,
  logServerEvent,
  serverErrorDetails,
  withRequestId,
} from '#/server/http'

export const Route = createFileRoute('/api/health')({
  server: {
    handlers: {
      GET: async ({ context, request }) => {
        const requestId = getRequestId(request)
        let dependency = 'application'

        try {
          const services = context.getServices()
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
              {
                status: 503,
                headers: { 'cache-control': 'no-store' },
              },
            ),
            requestId,
          )
        }
      },
    },
  },
})
