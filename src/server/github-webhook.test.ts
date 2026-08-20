import { describe, expect, it } from 'vitest'

import {
  changedWebhookPaths,
  verifyGitHubWebhookSignature,
} from './github-webhook.server'

function toHex(value: ArrayBuffer) {
  return [...new Uint8Array(value)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

describe('GitHub webhooks', () => {
  it('verifies HMAC signatures with Web Crypto', async () => {
    const body = JSON.stringify({ ref: 'refs/heads/main' })
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode('secret'),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )
    const digest = await crypto.subtle.sign(
      'HMAC',
      key,
      new TextEncoder().encode(body),
    )
    const signature = `sha256=${toHex(digest)}`

    await expect(
      verifyGitHubWebhookSignature('secret', body, signature),
    ).resolves.toBe(true)
    await expect(
      verifyGitHubWebhookSignature('wrong', body, signature),
    ).resolves.toBe(false)
    await expect(
      verifyGitHubWebhookSignature('secret', body, 'sha256=bad'),
    ).resolves.toBe(false)
  })

  it('deduplicates and normalizes changed paths', () => {
    expect(
      changedWebhookPaths({
        commits: [
          { added: ['/content/new.md'], modified: ['content/post.md'] },
          { removed: ['content/post.md'] },
        ],
      }),
    ).toEqual(['content/new.md', 'content/post.md'])
  })
})
