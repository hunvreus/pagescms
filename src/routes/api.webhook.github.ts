import { createFileRoute } from '@tanstack/react-router'

import {
  handleGitHubWebhook,
  verifyGitHubWebhookSignature,
} from '#/server/github-webhook.server'

const MAX_WEBHOOK_BYTES = 10_000_000

export const Route = createFileRoute('/api/webhook/github')({
  server: {
    handlers: {
      POST: async ({ request, context }) => {
        const services = context.getServices()
        const secret = services.configuration.githubWebhookSecret
        if (!secret) {
          return Response.json(
            { error: 'GitHub webhooks are not configured' },
            { status: 503 },
          )
        }
        const declaredLength = Number(request.headers.get('content-length'))
        if (
          Number.isFinite(declaredLength) &&
          declaredLength > MAX_WEBHOOK_BYTES
        ) {
          return Response.json({ error: 'Payload too large' }, { status: 413 })
        }
        const body = await request.text()
        if (new TextEncoder().encode(body).byteLength > MAX_WEBHOOK_BYTES) {
          return Response.json({ error: 'Payload too large' }, { status: 413 })
        }
        const verified = await verifyGitHubWebhookSignature(
          secret,
          body,
          request.headers.get('x-hub-signature-256'),
        )
        if (!verified) {
          return Response.json({ error: 'Invalid signature' }, { status: 401 })
        }
        const event = request.headers.get('x-github-event')
        if (!event) {
          return Response.json({ error: 'Missing event' }, { status: 400 })
        }
        let payload: unknown
        try {
          payload = JSON.parse(body)
        } catch {
          return Response.json({ error: 'Invalid JSON' }, { status: 400 })
        }
        await handleGitHubWebhook(
          services.database,
          event,
          payload,
          services.repositoryAccess.forInstallation,
          services.cacheDatabase,
        )
        return Response.json({ accepted: true })
      },
    },
  },
})
