import { Hono } from 'hono/quick'
import type { ApiEnvironment } from './shared'
import { githubWebhookResponse } from '#/server/github/webhook-response'

const router = new Hono<ApiEnvironment>()

router.post('/api/webhook/github', (context) =>
  githubWebhookResponse(context.req.raw, context.env.getServices()),
)

export default router
