import { getRequestListener } from '@hono/node-server'
import type { Connect } from 'vite'

interface NodeApplication {
  handlesRequest: (request: Request) => boolean
  fetch: (request: Request) => Promise<Response>
}

export function nodeApiMiddleware(
  load: () => Promise<NodeApplication>,
): Connect.NextHandleFunction {
  return async (incoming, outgoing, next) => {
    try {
      const app = await load()
      const url = new URL(
        incoming.url ?? '/',
        `http://${incoming.headers.host ?? 'localhost'}`,
      )
      if (!app.handlesRequest(new Request(url))) return next()
      // Hono's second argument contains HTTP bindings. Only function hosts supply waitUntil.
      await getRequestListener((request) => app.fetch(request))(
        incoming,
        outgoing,
      )
    } catch (error) {
      next(error)
    }
  }
}
