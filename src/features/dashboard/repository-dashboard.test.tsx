import { TestI18n } from '#/i18n/test-provider'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { RepositoryDashboard } from './repository-dashboard'

it('explains missing GitHub App configuration without offering an unusable installation link', () => {
  const markup = renderToStaticMarkup(
    <TestI18n>
      <QueryClientProvider client={new QueryClient()}>
        <RepositoryDashboard
          accounts={[]}
          githubConnected
          githubAppInstallAvailable={false}
          isAdmin={false}
          user={{
            id: 'user',
            name: 'Editor',
            email: 'editor@example.com',
            image: null,
            githubUsername: null,
          }}
        />
      </QueryClientProvider>
    </TestI18n>,
  )
  expect(markup).toContain('GitHub App unavailable')
  expect(markup).toContain(
    'Ask your administrator to configure the GitHub App.',
  )
  expect(markup).not.toContain('/api/github-app/install')
})
