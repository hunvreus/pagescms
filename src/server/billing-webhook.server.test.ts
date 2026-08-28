import { describe, expect, it, vi } from 'vitest'

import { handleBillingWebhookRequest } from './billing-webhook.server'

describe('handleBillingWebhookRequest', () => {
  it('returns not found when no deployment handler is configured', async () => {
    const response = await handleBillingWebhookRequest(
      new Request('https://app.pagescms.org/api/webhooks/billing', {
        method: 'POST',
      }),
      undefined,
    )

    expect(response.status).toBe(404)
  })

  it('preserves raw bytes and headers for provider signature verification', async () => {
    const bytes = new Uint8Array([0, 255, 123, 10, 13])
    const handle = vi.fn(
      async (_input: { body: Uint8Array; headers: Headers }) => ({
        status: 202 as const,
      }),
    )
    const response = await handleBillingWebhookRequest(
      new Request('https://app.pagescms.org/api/webhooks/billing', {
        method: 'POST',
        headers: { 'x-provider-signature': 'signed' },
        body: bytes,
      }),
      { handle },
    )

    expect(response.status).toBe(202)
    expect(handle).toHaveBeenCalledOnce()
    const input = handle.mock.calls[0][0]
    expect([...input.body]).toEqual([...bytes])
    expect(input.headers.get('x-provider-signature')).toBe('signed')
  })

  it('rejects oversized bodies before invoking the provider', async () => {
    const handle = vi.fn(
      async (_input: { body: Uint8Array; headers: Headers }) => undefined,
    )
    const response = await handleBillingWebhookRequest(
      new Request('https://app.pagescms.org/api/webhooks/billing', {
        method: 'POST',
        headers: { 'content-length': '2000001' },
      }),
      { handle },
    )

    expect(response.status).toBe(413)
    expect(handle).not.toHaveBeenCalled()
  })
})
