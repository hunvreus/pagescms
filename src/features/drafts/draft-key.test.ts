import { expect, it } from 'vitest'
import { contentDraftKey } from './draft-store'

it('configuration drafts cannot collide with a content definition for the same file', () => {
  const target = {
    repoId: '123',
    owner: 'Owner',
    repo: 'Repo',
    branch: 'main',
    name: 'Configuration',
    path: '.pages.yml',
  }
  const contentKey = JSON.stringify([
    'account',
    'github',
    '123',
    'main',
    'Configuration',
    '.pages.yml',
    null,
  ])
  expect(contentDraftKey('account', 'github', target)).toBe(contentKey)
  expect(
    contentDraftKey('account', 'github', { ...target, kind: 'configuration' }),
  ).not.toBe(contentKey)
})
