import { createFileRoute } from '@tanstack/react-router'

import type {} from '@tanstack/react-start'

import { getRequestId, withRequestId } from '#/server/http'

const repository = 'pagescms/pagescms'
const packageUrl =
  'https://raw.githubusercontent.com/pagescms/pagescms/main/package.json'

export const Route = createFileRoute('/api/app/version')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const requestId = getRequestId(request)
        try {
          const response = await fetch(packageUrl, {
            headers: { accept: 'application/json' },
          })
          if (!response.ok) throw new Error('Version source unavailable')
          const value: unknown = await response.json()
          const version =
            typeof value === 'object' &&
            value !== null &&
            'version' in value &&
            typeof value.version === 'string'
              ? value.version
              : null
          return withRequestId(
            Response.json(
              {
                status: 'success',
                latest: version,
                repository,
                source: 'package.json',
              },
              {
                headers: {
                  'cache-control':
                    'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
                },
              },
            ),
            requestId,
          )
        } catch {
          return withRequestId(
            Response.json(
              {
                status: 'error',
                message: 'Unable to fetch latest app version.',
              },
              { status: 502 },
            ),
            requestId,
          )
        }
      },
    },
  },
})
