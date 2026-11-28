import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { readFile } from 'node:fs/promises'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'

export async function serveNode({
  root = process.cwd(),
  port = 3000,
  host = 'localhost',
} = {}) {
  const entry = await import(
    pathToFileURL(resolve(root, 'dist/server/server.js')).href
  )
  if (typeof entry.default?.fetch !== 'function')
    throw new Error('Run pagescms build for the Node target first')
  const shell = await readFile(resolve(root, 'dist/client/index.html'))
  const app = new Hono()
  app.use('*', async (context, next) => {
    await next()
    if (context.res.headers.get('content-type')?.startsWith('text/html')) {
      context.header('content-security-policy', "frame-ancestors 'none'", {
        append: true,
      })
      context.header('x-frame-options', 'DENY')
      context.header('cache-control', 'no-cache')
    } else if (context.req.path.startsWith('/assets/') && context.res.ok) {
      context.header('cache-control', 'public, max-age=31536000, immutable')
    }
  })
  app.use('*', serveStatic({ root: resolve(root, 'dist/client') }))
  app.all('*', (context) =>
    entry.default.handlesRequest(context.req.raw)
      ? entry.default.fetch(context.req.raw)
      : new Response(shell, {
          headers: { 'content-type': 'text/html; charset=utf-8' },
        }),
  )
  const server = serve({ fetch: app.fetch, port, hostname: host }, () => {
    console.log(`Pages CMS: http://${host}:${port}`)
  })
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => server.close(() => process.exit(0)))
  }
  return server
}
