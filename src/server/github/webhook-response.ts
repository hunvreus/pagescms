import { readLimitedBody, RequestTooLarge } from '#/server/request-body'
import { createGitHubAppApi } from '#/server/github/app'
import { logServerEvent, serverErrorDetails } from '#/server/http'

import {
  handleGitHubWebhook,
  verifyGitHubWebhookSignature,
} from '#/server/github/webhook'

import type { RequestServices } from '#/server/context'

const MAX_WEBHOOK_BYTES = 10_000_000

export async function githubWebhookResponse(
  request: Request,
  services: RequestServices,
) {
  const secret = services.configuration.githubWebhookSecret
  if (!secret) {
    return Response.json(
      { error: 'GitHub webhooks are not configured' },
      { status: 503 },
    )
  }
  let body: string
  try {
    body = new TextDecoder().decode(
      await readLimitedBody(request, MAX_WEBHOOK_BYTES),
    )
  } catch (error) {
    if (!(error instanceof RequestTooLarge)) throw error
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
  const processing = handleGitHubWebhook(
    services.database,
    event,
    payload,
    services.repositoryAccess.forInstallation,
    services.cacheDatabase,
    services.configuration.githubApp
      ? (installationId) =>
          createGitHubAppApi(
            services.configuration.githubApp!,
          ).getInstallationAccount(installationId)
      : undefined,
    services.waitUntil,
    services.configurationStore,
  )
  if (event === 'push' && services.waitUntil) {
    services.waitUntil(
      processing.catch((error: unknown) =>
        logServerEvent('error', {
          event: 'github_webhook_processing_failed',
          webhookEvent: event,
          ...serverErrorDetails(error),
        }),
      ),
    )
  } else {
    await processing
  }
  return Response.json({ accepted: true })
}
