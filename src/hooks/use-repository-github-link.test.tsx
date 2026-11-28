import { TestI18n } from '#/i18n/test-provider'
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
  expect(renderToStaticMarkup(<TestI18n>{<Link />}</TestI18n>)).toBe('')
})

it.each([true, false])(
  'uses resolved repository access (%s), not account identity',
  (allowed) => {
    const html = renderToStaticMarkup(
      <TestI18n>
        {
          <RepositoryGitHubLinkContext value={allowed}>
            <Link />
          </RepositoryGitHubLinkContext>
        }
      </TestI18n>,
    )
    expect(html.includes('View on GitHub')).toBe(allowed)
  },
)
