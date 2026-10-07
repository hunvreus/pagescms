import { createFileRoute } from '@tanstack/react-router'
import { mediaPreviewResponse } from '#/server/media-preview.server'

export const Route = createFileRoute(
  '/api/media-preview/$owner/$repo/$branch/$name/$',
)({
  server: {
    handlers: {
      GET: ({ params, request, context }) =>
        mediaPreviewResponse(request, context.getServices(), params),
    },
  },
})
