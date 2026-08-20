import { describe, expect, it } from 'vitest'

import {
  buildCommitTokens,
  resolveCommitIdentity,
  resolveCommitMessage,
} from './commit-message'

describe('buildCommitTokens', () => {
  it('builds canonical path, filename, repository, and user tokens', () => {
    expect(
      buildCommitTokens({
        action: 'rename',
        owner: 'hunvreus',
        repo: 'pagescms',
        branch: 'feature/editor',
        oldPath: '/content//drafts/../old.md',
        newPath: 'content/new.md',
        contentName: 'posts',
        userName: 'Han',
        userEmail: 'han@example.com',
      }),
    ).toEqual(
      expect.objectContaining({
        action: 'rename',
        owner: 'hunvreus',
        repo: 'pagescms',
        branch: 'feature/editor',
        name: 'posts',
        user: 'Han',
        oldPath: 'content/old.md',
        oldFilename: 'old.md',
        newPath: 'content/new.md',
        newFilename: 'new.md',
      }),
    )
  })
})

describe('resolveCommitMessage', () => {
  const tokens = {
    path: 'content/posts/hello.md',
    filename: 'hello.md',
    user: 'Han',
  }

  it('uses legacy default templates', () => {
    expect(resolveCommitMessage({ action: 'update', tokens })).toBe(
      'Update content/posts/hello.md (via Pages CMS)',
    )
  })

  it('prefers a non-empty operation override over global configuration', () => {
    expect(
      resolveCommitMessage({
        configuration: {
          settings: {
            commit: { templates: { update: 'Global {filename}' } },
          },
        },
        templatesOverride: { update: 'Editing {filename} by {user}' },
        action: 'update',
        tokens,
      }),
    ).toBe('Editing hello.md by Han')
  })

  it('removes unknown tokens, normalizes whitespace, and caps messages', () => {
    const message = resolveCommitMessage({
      templatesOverride: { create: `  Create   {missing} ${'x'.repeat(250)} ` },
      action: 'create',
      tokens,
    })

    expect(message.startsWith('Create x')).toBe(true)
    expect(message).toHaveLength(200)
  })
})

describe('resolveCommitIdentity', () => {
  it('defaults to the app identity and honors configured or explicit user identity', () => {
    expect(resolveCommitIdentity({})).toBe('app')
    expect(
      resolveCommitIdentity({
        configuration: { settings: { commit: { identity: 'user' } } },
      }),
    ).toBe('user')
    expect(
      resolveCommitIdentity({
        configuration: { settings: { commit: { identity: 'user' } } },
        identityOverride: 'app',
      }),
    ).toBe('app')
  })
})
