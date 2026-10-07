import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import {
  RepositoryGitHubLinkContext,
  useRepositoryGitHubLink,
} from './use-repository-github-link'

function Link() {
  return useRepositoryGitHubLink() ? (
    <a href="https://github.com/owner/repo">View on GitHub</a>
  ) : null
}

it('hides repository links outside a repository context, including the landing page', () => {
  expect(renderToStaticMarkup(<Link />)).toBe('')
})

it.each([true, false])(
  'uses resolved repository access (%s), not account identity',
  (allowed) => {
    const html = renderToStaticMarkup(
      <RepositoryGitHubLinkContext value={allowed}>
        <Link />
      </RepositoryGitHubLinkContext>,
    )
    expect(html.includes('View on GitHub')).toBe(allowed)
  },
)
