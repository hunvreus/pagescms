import { expect, it } from 'vitest'
import {
  canonicalRepositoryHref,
  rememberRepositoryIdentity,
  repositoryIdentityKey,
} from './repository-identity'
import { contentDraftKey } from '#/features/drafts/draft-store'
import { queryKeys } from '#/client/queries/keys'

it('preserves the entry suffix, encoded branch, query and fragment during canonical redirects', () => {
  expect(
    canonicalRepositoryHref(
      '/github/old-owner/old-repo/feature%2Fa/collection/posts/entry/posts/a.md?draft=abc#body',
      { owner: 'NewOwner', repo: 'NewRepo' },
    ),
  ).toBe(
    '/github/NewOwner/NewRepo/feature%2Fa/collection/posts/entry/posts/a.md?draft=abc#body',
  )
})
it('uses the same draft and query identity after rename and a different identity after name reuse', () => {
  const old = {
    owner: 'identity-old',
    repo: 'identity-demo',
    branch: 'main',
    repoId: '42',
    name: 'posts',
    path: 'posts/a.md',
  }
  const current = {
    ...old,
    owner: 'identity-current',
    repo: 'identity-renamed',
  }
  rememberRepositoryIdentity({ ...current, id: 42 }, old)
  expect(contentDraftKey('account', 'github.com', old)).toBe(
    contentDraftKey('account', 'github.com', current),
  )
  expect(queryKeys.branch(old)).toEqual(queryKeys.branch(current))
  expect(contentDraftKey('other-account', 'github.com', current)).not.toBe(
    contentDraftKey('account', 'github.com', current),
  )
  rememberRepositoryIdentity({ ...old, id: 43 })
  expect(repositoryIdentityKey({ ...old, repoId: '43' })).not.toBe(
    repositoryIdentityKey(current),
  )
  expect(
    contentDraftKey('account', 'github.com', { ...old, repoId: '43' }),
  ).not.toBe(contentDraftKey('account', 'github.com', current))
})

it('does not canonicalize URLs outside the GitHub repository namespace', () => {
  for (const href of ['/settings/profile', '/teams/acme', '/oauth/consent'])
    expect(canonicalRepositoryHref(href, { owner: 'new', repo: 'repo' })).toBe(
      href,
    )
})
