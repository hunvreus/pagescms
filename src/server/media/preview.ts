import { parseMediaVariant } from '#/lib/media-variants'
import { normalizeGitPath } from '#/shared/git-path'
import { mediaContentType } from '#/lib/media-assets'
import { repositoryRef } from '#/lib/repository'
import { AccessDeniedError } from '#/server/access/policy'
import { loadMediaPreview } from './media'
import {
  MediaNotFoundError,
  MediaRevisionMismatchError,
  MediaPreviewUnavailableError,
} from './provider'
import { isRepositoryProviderError } from '../repository/provider'
import { resolveRepositoryPrincipal } from '#/server/access/repository-policy'
import { logServerEvent, serverErrorDetails } from '../http'
import type { RequestServices } from '#/server/context'

const previewSecurityHeaders = {
  'content-security-policy':
    "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  'x-content-type-options': 'nosniff',
}

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
    return Response.json(
      { error: 'Authentication required' },
      { status: 401, headers: previewSecurityHeaders },
    )
  let path: string
  let repository: ReturnType<typeof repositoryRef>
  try {
    path = params._splat ? normalizeGitPath(params._splat) : ''
    repository = repositoryRef(params)
    parseMediaVariant(new URL(request.url).searchParams.get('variant'))
    if (!path) throw new Error('Missing media path')
  } catch {
    return Response.json(
      { error: 'Invalid media path' },
      { status: 400, headers: previewSecurityHeaders },
    )
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
          identityDatabase: services.database,
          mediaProviderResolver: services.mediaProviderResolver,
          repositoryAccess: services.repositoryAccess,
          user,
          ...input,
          ifNoneMatch: request.headers.get('if-none-match') ?? undefined,
          variant: parseMediaVariant(
            new URL(request.url).searchParams.get('variant'),
          ),
          revision:
            new URL(request.url).searchParams.get('revision') ?? undefined,
        }),
    )
    const headers = {
      'cache-control': 'private, max-age=60, stale-while-revalidate=300',
      'content-type': file.contentType ?? mediaContentType(path),
      ...previewSecurityHeaders,
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
    const status =
      error instanceof MediaPreviewUnavailableError
        ? 503
        : error instanceof MediaRevisionMismatchError
          ? 409
          : denied
            ? 403
            : error instanceof MediaNotFoundError ||
                isRepositoryProviderError(error, 404)
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
      {
        status,
        headers: {
          ...previewSecurityHeaders,
          ...(status === 503 ? { 'retry-after': '5' } : {}),
        },
      },
    )
  }
}
