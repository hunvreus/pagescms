import { Hono } from 'hono/quick'
import type { ApiEnvironment } from './shared'
import { handlePluginRequest } from '#/server/routes/plugin-request'

const router = new Hono<ApiEnvironment>()

router.on(
  ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  '/api/plugins/:plugin/*',
  (context) => {
    let path: string
    try {
      path = decodeURIComponent(
        new URL(context.req.url).pathname.split('/').slice(4).join('/'),
      )
    } catch {
      return new Response('Invalid path', { status: 400 })
    }
    const services = context.env.getServices()
    return handlePluginRequest(
      services.pluginRoutes,
      context.req.param('plugin'),
      path,
      context.req.raw,
      services,
    )
  },
)

export default router
