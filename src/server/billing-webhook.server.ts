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

  const result = await handler.handle({
    body,
    headers: new Headers(request.headers),
  })

  return new Response(null, { status: result?.status ?? 204 })
}
