import { expect, it } from 'vitest'
import { contentDraftKey } from './draft-store'

it('configuration drafts cannot collide with a content definition for the same file', () => {
  const target = {
    owner: 'Owner',
    repo: 'Repo',
    branch: 'main',
    name: 'Configuration',
    path: '.pages.yml',
  }
  const legacy = JSON.stringify([
    'account',
    'github',
    'owner',
    'repo',
    'main',
    'Configuration',
    '.pages.yml',
    null,
  ])
  expect(contentDraftKey('account', 'github', target)).toBe(legacy)
  expect(
    contentDraftKey('account', 'github', { ...target, kind: 'configuration' }),
  ).not.toBe(legacy)
})
