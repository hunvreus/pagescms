import { RequestTooLarge } from '#/server/request-body'
import { classifyOperationError } from '#/server/services/errors'
import { Hono } from 'hono/quick'
import type { ApiEnvironment } from '#/server/routes/shared'
import { CollaboratorRequestError } from '#/server/collaborators/collaborators'
import { matchPluginHandler } from '#/plugins/compose.server'
import { CONTENT_CONFLICT } from '#/shared/content-conflict'
import { MediaNotFoundError, MEDIA_COPY_CONFLICT } from '#/shared/media-error'
import { fieldValidationIssues } from '#/shared/field-validation-error'
import {
  UserError,
  getRequestId,
  logServerEvent,
  serverErrorDetails,
} from '#/server/http'
import { AccessDeniedError } from '#/server/access/policy'
import { isRepositoryProviderError } from '#/server/repository/provider'
import { GitHubApiError } from '#/server/github/api'
import repositoriesRoutes from '#/server/routes/repositories'
import mediaRoutes from '#/server/routes/media'
import pluginsRoutes from '#/server/routes/plugins'
import entriesRoutes from '#/server/routes/entries'
import actionsRoutes from '#/server/routes/actions'
import cacheRoutes from '#/server/routes/cache'
import authRoutes from '#/server/routes/auth'
import accountRoutes from '#/server/routes/account'
import collaboratorsRoutes from '#/server/routes/collaborators'
import adminRoutes from '#/server/routes/admin'
import webhooksRoutes from '#/server/routes/webhooks'
import configurationRoutes from '#/server/routes/configuration'
import activityRoutes from '#/server/routes/activity'
import healthRoutes from '#/server/routes/health'

export const api = new Hono<ApiEnvironment>()

api.notFound((context) => {
  const services = context.env.getServices()
  const handler = matchPluginHandler(services.pluginHandlers, context.req.path)
  if (!handler) return new Response('404 Not Found', { status: 404 })
  if (!(handler.methods as readonly string[]).includes(context.req.method))
    return new Response(null, {
      status: 405,
      headers: { allow: handler.methods.join(', ') },
    })
  return handler.handle(context.req.raw, {
    services,
    requestId: context.env.requestId ?? getRequestId(context.req.raw),
  })
})

api.onError((error, context) => {
  if (
    context.req.path === '/api/entries' &&
    isRepositoryProviderError(error, 404)
  )
    return Response.json({ code: 'not_found' }, { status: 404 })
  if (error instanceof RequestTooLarge)
    return Response.json({ code: 'payload_too_large' }, { status: 413 })
  if (error instanceof CollaboratorRequestError)
    return Response.json(
      { code: 'operation_error', message: error.message },
      { status: error.status },
    )
  if (error.message === CONTENT_CONFLICT)
    return Response.json({ code: 'content_conflict' }, { status: 409 })
  if (fieldValidationIssues(error) || error.message === MEDIA_COPY_CONFLICT)
    return Response.json(
      { code: 'operation_error', message: error.message },
      { status: 400 },
    )
  if (error instanceof GitHubApiError && error.status === 409)
    return Response.json(
      { code: 'operation_error', message: error.message },
      { status: 409 },
    )
  if (error instanceof AccessDeniedError)
    return Response.json(
      {
        code: 'access_denied',
        reason: error.reason,
        actionUrl: error.actionUrl,
      },
      { status: 403 },
    )
  const failure = classifyOperationError(error)
  const statuses = {
    forbidden: 403,
    feature_unavailable: 403,
    quota_exceeded: 429,
    not_found: 404,
    conflict: 409,
    busy: 409,
    invalid: 400,
    configuration_invalid: 422,
    rate_limited: 429,
    unavailable: 503,
    internal: 500,
  }
  if (error instanceof GitHubApiError && failure.kind === 'internal')
    return Response.json(
      { code: 'github_request_failed', status: error.status },
      { status: 502 },
    )
  if (failure.kind !== 'internal')
    return Response.json(
      {
        code: 'operation_error',
        message:
          error instanceof UserError || error instanceof MediaNotFoundError
            ? error.message
            : failure.message,
      },
      {
        status: statuses[failure.kind],
        headers: failure.retryAfter
          ? { 'retry-after': failure.retryAfter }
          : undefined,
      },
    )
  logServerEvent('error', {
    event: 'api_error',
    path: context.req.path,
    ...serverErrorDetails(error),
  })
  return Response.json({ code: 'internal_error' }, { status: 500 })
})

api.route('/', repositoriesRoutes)
api.route('/', mediaRoutes)
api.route('/', pluginsRoutes)
api.route('/', entriesRoutes)
api.route('/', actionsRoutes)
api.route('/', cacheRoutes)
api.route('/', authRoutes)
api.route('/', accountRoutes)
api.route('/', collaboratorsRoutes)
api.route('/', adminRoutes)
api.route('/', webhooksRoutes)
api.route('/', configurationRoutes)
api.route('/', activityRoutes)
api.route('/', healthRoutes)
