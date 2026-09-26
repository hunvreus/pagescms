import { describe, expect, it } from 'vitest'

import {
  changedWebhookPaths,
  repositoryPushChanges,
  verifyGitHubWebhookSignature,
} from './github-webhook.server'

function toHex(value: ArrayBuffer) {
  return [...new Uint8Array(value)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

describe('GitHub webhooks', () => {
  it('reduces multiple commits to the final operation for each path', () => {
    expect(
      repositoryPushChanges({
        commits: [
          { added: ['posts/new.md'], modified: ['posts/old.md'], removed: [] },
          { added: [], modified: [], removed: ['posts/new.md'] },
          { added: ['posts/new.md'], modified: [], removed: [] },
        ],
      }),
    ).toEqual([
      { path: 'posts/new.md', removed: false },
      { path: 'posts/old.md', removed: false },
    ])
  })

  it('reconciles force pushes and incomplete payloads rather than trusting their file list', () => {
    const commit = { added: [], modified: [], removed: [] }
    expect(
      repositoryPushChanges({ forced: true, commits: [commit] }),
    ).toBeNull()
    expect(repositoryPushChanges({ size: 2, commits: [commit] })).toBeNull()
    expect(
      repositoryPushChanges({ commits: [{ modified: ['post.md'] }] }),
    ).toBeNull()
    expect(
      repositoryPushChanges({ commits: [], before: 'old', after: 'new' }),
    ).toBeNull()
  })

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
