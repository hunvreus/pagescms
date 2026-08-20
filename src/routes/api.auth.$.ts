import { createFileRoute } from '@tanstack/react-router'

import type { RequestServices } from '#/server/request-services.server'

function handleAuthRequest(
  request: Request,
  getServices: () => RequestServices,
) {
  return getServices().auth.handler(request)
}

export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      GET: ({ request, context }) =>
        handleAuthRequest(request, context.getServices),
      POST: ({ request, context }) =>
        handleAuthRequest(request, context.getServices),
      PUT: ({ request, context }) =>
        handleAuthRequest(request, context.getServices),
      PATCH: ({ request, context }) =>
        handleAuthRequest(request, context.getServices),
      DELETE: ({ request, context }) =>
        handleAuthRequest(request, context.getServices),
    },
  },
})
