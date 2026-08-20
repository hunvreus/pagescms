import { createFileRoute } from '@tanstack/react-router'

import type {} from '@tanstack/react-start'

import { getRequestId, withRequestId } from '#/server/http'

export const Route = createFileRoute('/api/health')({
  server: {
    handlers: {
      GET: ({ request }) => {
        const requestId = getRequestId(request)

        return withRequestId(
          Response.json({
            service: 'pagescms',
            status: 'ok',
          }),
          requestId,
        )
      },
    },
  },
})
