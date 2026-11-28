import { TestI18n } from '#/i18n/test-provider'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { ConfigurationRequired } from './configuration-required'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}))
const coordinates = { owner: 'owner', repo: 'repo', branch: 'test-magic' }
it('gives managers a configuration action and branch context', () => {
  const html = renderToStaticMarkup(
    <TestI18n>
      {<ConfigurationRequired coordinates={coordinates} canConfigure />}
    </TestI18n>,
  )
  expect(html).toContain('Overview')
  expect(html).toContain('No configuration yet')
  expect(html).toContain('test-magic')
  expect(html).toContain('Configure')
})
it('directs other users to a manager without offering configuration controls', () => {
  const html = renderToStaticMarkup(
    <TestI18n>
      {<ConfigurationRequired coordinates={coordinates} canConfigure={false} />}
    </TestI18n>,
  )
  expect(html).toContain('Ask a project manager')
  expect(html).not.toContain('<a')
})
it('explains broken configuration to non-managers without telling them to edit it', () => {
  const html = renderToStaticMarkup(
    <TestI18n>
      {
        <ConfigurationRequired
          coordinates={coordinates}
          canConfigure={false}
          invalid
        />
      }
    </TestI18n>,
  )
  expect(html).toContain('Ask a project manager to fix it')
  expect(html).not.toContain('<a')
})
