import { BillingWebhookRequestError } from '#/deployment/contracts/hosted.server'

import type { BillingWebhookHandler } from '#/deployment/contracts/hosted.server'

const MAX_BILLING_WEBHOOK_BYTES = 2_000_000

export async function handleBillingWebhookRequest(
  request: Request,
  handler: BillingWebhookHandler | undefined,
) {
  if (!handler) {
    return Response.json(
      { error: 'Billing webhooks are not configured' },
      { status: 404 },
    )
  }

  const declaredLength = Number(request.headers.get('content-length'))
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_BILLING_WEBHOOK_BYTES
  ) {
    return Response.json({ error: 'Payload too large' }, { status: 413 })
  }

  const body = new Uint8Array(await request.arrayBuffer())
  if (body.byteLength > MAX_BILLING_WEBHOOK_BYTES) {
    return Response.json({ error: 'Payload too large' }, { status: 413 })
  }

  let result: Awaited<ReturnType<BillingWebhookHandler['handle']>>
  try {
    result = await handler.handle({
      body,
      headers: new Headers(request.headers),
    })
  } catch (error) {
    if (error instanceof BillingWebhookRequestError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    throw error
  }

  return new Response(null, { status: result?.status ?? 204 })
}
