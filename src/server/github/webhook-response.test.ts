import { expect, it, vi } from 'vitest'
import { githubWebhookResponse } from '#/server/github/webhook-response'
import {
  handleGitHubWebhook,
  verifyGitHubWebhookSignature,
} from '#/server/github/webhook'
import type { RequestServices } from '#/server/context'

vi.mock('#/server/github/webhook', () => ({
  verifyGitHubWebhookSignature: vi.fn(async () => true),
  handleGitHubWebhook: vi.fn(),
}))

it('acknowledges a push while its cache update continues in waitUntil', async () => {
  let finish!: () => void
  const processing = new Promise<void>((resolve) => {
    finish = resolve
  })
  vi.mocked(handleGitHubWebhook).mockReturnValueOnce(processing)
  const waitUntil = vi.fn()
  const services = {
    configuration: { githubWebhookSecret: 'secret' },
    repositoryAccess: {},
    waitUntil,
  } as unknown as RequestServices
  const response = await githubWebhookResponse(
    new Request('https://example.com/api/webhook/github', {
      method: 'POST',
      headers: { 'x-github-event': 'push' },
      body: '{}',
    }),
    services,
  )
  expect(response.status).toBe(200)
  expect(waitUntil).toHaveBeenCalledOnce()
  finish()
  await waitUntil.mock.calls[0][0]
})

it('rejects an oversized UTF-8 webhook even when its character count is smaller', async () => {
  const services = {
    configuration: { githubWebhookSecret: 'secret' },
  } as unknown as RequestServices
  const response = await githubWebhookResponse(
    new Request('https://example.com/api/webhook/github', {
      method: 'POST',
      body: 'é'.repeat(5_000_001),
    }),
    services,
  )
  expect(response.status).toBe(413)
})

it('stops reading an oversized chunked body before verifying its signature', async () => {
  const cancel = vi.fn()
  let reads = 0
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        reads++
        controller.enqueue(new Uint8Array(5_000_001))
      },
      cancel,
    },
    { highWaterMark: 0 },
  )
  const verify = vi.mocked(verifyGitHubWebhookSignature)
  verify.mockClear()
  const response = await githubWebhookResponse(
    new Request('https://example.com/api/webhook/github', {
      method: 'POST',
      body: stream,
      duplex: 'half',
    } as RequestInit),
    { configuration: { githubWebhookSecret: 'secret' } } as RequestServices,
  )
  expect(response.status).toBe(413)
  expect(reads).toBe(2)
  expect(cancel).toHaveBeenCalledOnce()
  expect(verify).not.toHaveBeenCalled()
})

it('decodes multibyte characters split across chunks before signature verification', async () => {
  const encoded = new TextEncoder().encode('{"text":"é"}')
  const split = encoded.indexOf(0xc3) + 1
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoded.slice(0, split))
      controller.enqueue(encoded.slice(split))
      controller.close()
    },
  })
  const verify = vi.mocked(verifyGitHubWebhookSignature)
  verify.mockClear()
  const response = await githubWebhookResponse(
    new Request('https://example.com/api/webhook/github', {
      method: 'POST',
      body: stream,
      duplex: 'half',
    } as RequestInit),
    { configuration: { githubWebhookSecret: 'secret' } } as RequestServices,
  )
  expect(response.status).toBe(400)
  expect(verify).toHaveBeenCalledWith('secret', '{"text":"é"}', null)
})
