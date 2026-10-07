import { normalizeGitPath } from '#/lib/git-path'
import { mediaContentType } from '#/lib/media-assets'
import { repositoryRef } from '#/lib/repository'
import { AccessDeniedError } from './access-policy.server'
import { loadMediaPreview } from './media-service.server'
import { isRepositoryProviderError } from './repository-provider.server'
import { resolveRepositoryPrincipal } from './repository-policy.server'
import { logServerEvent, serverErrorDetails } from './http'
import type { RequestServices } from './request-services.server'

export async function mediaPreviewResponse(
  request: Request,
  services: RequestServices,
  params: {
    owner: string
    repo: string
    branch: string
    name: string
    _splat?: string
  },
) {
  const session = await services.getSession()
  if (!session?.user)
    return Response.json({ error: 'Authentication required' }, { status: 401 })
  let path: string
  let repository: ReturnType<typeof repositoryRef>
  try {
    path = params._splat ? normalizeGitPath(params._splat) : ''
    repository = repositoryRef(params)
    if (!path) throw new Error('Missing media path')
  } catch {
    return Response.json({ error: 'Invalid media path' }, { status: 400 })
  }
  const user = {
    id: session.user.id,
    email: session.user.email,
    emailVerified: session.user.emailVerified,
    githubUsername: session.user.githubUsername ?? null,
  }
  const input = {
    ...repository,
    branch: params.branch,
    name: params.name,
    path,
  }
  try {
    const principal = await resolveRepositoryPrincipal(
      services.repositoryAccess,
      user,
      input,
    )
    const file = await services.access.execute(
      {
        operation: 'media.read',
        principal,
        tenant: {
          type: 'repository',
          id: `${repository.owner}/${repository.repo}`.toLowerCase(),
        },
        target: { repository, branch: params.branch, media: params.name, path },
      },
      () =>
        loadMediaPreview({
          database: services.cacheDatabase,
          mediaProviderResolver: services.mediaProviderResolver,
          repositoryAccess: services.repositoryAccess,
          user,
          ...input,
          ifNoneMatch: request.headers.get('if-none-match') ?? undefined,
        }),
    )
    const headers = {
      'cache-control': 'private, max-age=60, stale-while-revalidate=300',
      'content-type': mediaContentType(path),
      'content-security-policy':
        "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      'x-content-type-options': 'nosniff',
      ...(file.etag ? { etag: file.etag } : {}),
    }
    if (file.notModified) return new Response(null, { status: 304, headers })
    return new Response(file.body, { headers })
  } catch (error) {
    const denied =
      error instanceof AccessDeniedError ||
      (error instanceof Error &&
        error.message.startsWith('You do not have permission to access')) ||
      isRepositoryProviderError(error, 401, 403)
    const status = denied
      ? 403
      : isRepositoryProviderError(error, 404)
        ? 404
        : 500
    logServerEvent('error', {
      event: 'media_preview_failed',
      ...input,
      ...serverErrorDetails(error),
    })
    return Response.json(
      {
        error:
          status === 403
            ? 'Media access denied'
            : status === 404
              ? 'Media not found'
              : 'Could not load media',
      },
      { status },
    )
  }
}
