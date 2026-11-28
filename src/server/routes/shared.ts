import { readLimitedBody, RequestTooLarge } from '#/server/request-body'
import type { Context } from 'hono'
import { sameOriginRequest } from '#/server/csrf'
import type { ServiceUser } from '#/server/services/context'
import { serviceUserFromSession } from '#/server/services/context'
import type { RequestServices } from '#/server/context'

export type ApiEnvironment = {
  Bindings: {
    publicBaseUrl: string
    getServices: () => RequestServices
    requestId?: string
  }
}

const MiB = 1024 * 1024
// Includes JSON escaping or base64 expansion on top of the decoded file limits.
const bodyLimits: Readonly<Record<string, number>> = {
  '/api/entries/raw': 30 * MiB,
  '/api/entries/structured': 30 * MiB,
  '/api/configuration': 6 * MiB,
  '/api/media/delivery': 6 * MiB,
  '/api/references': 6 * MiB,
}

export async function readRequestJson(request: Request): Promise<unknown> {
  const path = new URL(request.url).pathname
  const limit =
    request.method === 'POST' && path === '/api/media/files'
      ? 28 * MiB
      : (bodyLimits[path] ?? MiB)
  const body = await readLimitedBody(request, limit)
  return JSON.parse(new TextDecoder().decode(body)) as unknown
}

export function pagedQuery(input: unknown) {
  const query = input as Record<string, string | undefined>
  if (query.page !== undefined && !/^\d+$/.test(query.page))
    throw new Error('Invalid page')
  return {
    ...query,
    page: query.page === undefined ? undefined : Number(query.page),
  }
}

export function validatedRead<T>(
  parse: (input: unknown) => T,
  run: (
    services: RequestServices,
    user: ServiceUser,
    data: T,
  ) => Promise<unknown>,
) {
  return async (context: Context<ApiEnvironment>) => {
    const services = context.env.getServices()
    const session = await services.getSession()
    if (!session?.user)
      return Response.json({ code: 'authentication_required' }, { status: 401 })
    let input: T
    try {
      input = parse(context.req.query())
    } catch {
      return Response.json({ code: 'invalid_request' }, { status: 400 })
    }
    return Response.json(
      await run(services, serviceUserFromSession(session.user), input),
      {
        headers: { 'cache-control': 'no-store' },
      },
    )
  }
}

export function validatedWrite<T>(
  parse: (input: unknown) => T,
  run: (
    services: RequestServices,
    user: ServiceUser,
    data: T,
  ) => Promise<unknown>,
  refreshSession = false,
) {
  return async (context: Context<ApiEnvironment>) => {
    if (!sameOriginRequest(context.req.raw, context.env.publicBaseUrl))
      return Response.json({ code: 'forbidden' }, { status: 403 })
    const services = context.env.getServices()
    const session = await services.getSession()
    if (!session?.user)
      return Response.json({ code: 'authentication_required' }, { status: 401 })
    if (context.req.header('x-pagescms-account') !== session.user.id)
      return Response.json({ code: 'account_changed' }, { status: 409 })
    let input: T
    try {
      input = parse(await readRequestJson(context.req.raw))
    } catch (error) {
      if (error instanceof RequestTooLarge) throw error
      return Response.json({ code: 'invalid_request' }, { status: 400 })
    }
    const result = await run(
      services,
      serviceUserFromSession(session.user),
      input,
    )
    if (refreshSession) await services.refreshSession()
    return Response.json(result, {
      headers: { 'cache-control': 'no-store' },
    })
  }
}
