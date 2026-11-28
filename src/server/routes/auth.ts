import { readLimitedBody } from '#/server/request-body'
import { Hono } from 'hono/quick'
import { getCookie } from 'hono/cookie'
import { localeCookie } from '#/i18n/locale'
import { authenticationState } from '#/server/services/authentication-state'
import type { ApiEnvironment } from './shared'

const router = new Hono<ApiEnvironment>()

router.get('/api/session', async (context) =>
  Response.json(
    await authenticationState(
      context.env.getServices(),
      getCookie(context, localeCookie),
      context.req.header('accept-language'),
    ),
    {
      headers: { 'cache-control': 'no-store' },
    },
  ),
)

router.on(
  ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  '/api/auth/*',
  async (context) => {
    const services = context.env.getServices()
    const request = context.req.raw
    if (!request.body) return services.auth.handler(request)
    const body = await readLimitedBody(request, 1024 * 1024)
    return services.auth.handler(new Request(request, { body }))
  },
)

export default router
