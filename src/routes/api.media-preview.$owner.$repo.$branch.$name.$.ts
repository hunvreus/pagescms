import { createFileRoute } from '@tanstack/react-router'

import { decodeBase64Bytes, mediaContentType } from '#/lib/media-assets'
import { normalizeGitPath } from '#/lib/git-path'
import { repositoryRef } from '#/lib/repository'

export const Route = createFileRoute(
  '/api/media-preview/$owner/$repo/$branch/$name/$',
)({
  server: {
    handlers: {
      GET: async ({ params, request, context }) => {
        const services = context.getServices()
        const session = await services.getSession()
        if (!session?.user) {
          return Response.json(
            { error: 'Authentication required' },
            { status: 401 },
          )
        }
        const path = params._splat ? normalizeGitPath(params._splat) : ''
        if (!path) {
          return Response.json(
            { error: 'Media path is required' },
            { status: 400 },
          )
        }
        const repository = repositoryRef(params)
        const input = {
          ...repository,
          branch: params.branch,
          name: params.name,
          path,
        }
        try {
          const file = await services.access.execute(
            {
              operation: 'media.read',
              principal: { type: 'user', id: session.user.id },
              tenant: {
                type: 'repository',
                id: `${repository.owner}/${repository.repo}`.toLowerCase(),
              },
              target: {
                repository,
                branch: params.branch,
                media: params.name,
                path,
              },
            },
            async () => {
              const { loadMediaAsset } =
                await import('#/server/media-service.server')
              return loadMediaAsset({
                database: services.database,
                background: services.background,
                repositoryAccess: services.repositoryAccess,
                user: {
                  id: session.user.id,
                  email: session.user.email,
                  githubUsername: session.user.githubUsername ?? null,
                },
                ...input,
              })
            },
          )
          const etag = `"${file.sha}"`
          if (request.headers.get('if-none-match') === etag) {
            return new Response(null, { status: 304, headers: { etag } })
          }
          return new Response(decodeBase64Bytes(file.content), {
            headers: {
              'cache-control':
                'private, max-age=60, stale-while-revalidate=300',
              'content-type': mediaContentType(path),
              etag,
              'x-content-type-options': 'nosniff',
            },
          })
        } catch (error) {
          return Response.json(
            {
              error:
                error instanceof Error ? error.message : 'Could not load media',
            },
            { status: 404 },
          )
        }
      },
    },
  },
})
