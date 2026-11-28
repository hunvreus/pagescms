// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { setupI18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { expect, it, vi } from 'vitest'
import { DocumentTitle } from './document-title'

it('updates plugin page titles on activation without navigation or remounting content', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const i18n = setupI18n({
    locale: 'en',
    messages: {
      en: { 'test.title': ['Plugin settings'] },
      fr: { 'test.title': ['Réglages du plugin'] },
    },
  })
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  try {
    await act(async () =>
      root.render(
        <I18nProvider i18n={i18n}>
          <input defaultValue="unsaved" />
          <DocumentTitle
            message={{ id: 'test.title' }}
            repository={{ owner: 'acme', repo: 'site', branch: 'main' }}
          />
        </I18nProvider>,
      ),
    )
    const input = host.querySelector('input')!
    expect(document.title).toBe('Plugin settings - acme/site@main | Pages CMS')
    await act(async () => i18n.activate('fr'))
    expect(document.title).toBe(
      'Réglages du plugin - acme/site@main | Pages CMS',
    )
    expect(host.querySelector('input')).toBe(input)
    expect(input.value).toBe('unsaved')
  } finally {
    await act(async () => root.unmount())
    host.remove()
    vi.unstubAllGlobals()
  }
})
