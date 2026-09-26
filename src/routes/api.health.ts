import { createFileRoute } from '@tanstack/react-router'

import type {} from '@tanstack/react-start'

import { checkDatabaseReadiness } from '#/server/health.server'
import { getRequestId, logServerEvent, withRequestId } from '#/server/http'

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
          return withRequestId(
            Response.json(
              {
                service: 'pagescms',
                status: 'ok',
                checks: { database: 'ok' },
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
            error: error instanceof Error ? error.message : 'unknown error',
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
