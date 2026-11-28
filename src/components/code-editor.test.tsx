// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { setupI18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { EditorView } from '@codemirror/view'
import { forEachDiagnostic } from '@codemirror/lint'
import { expect, it, vi } from 'vitest'
import { messages as english } from '../locales/en/messages.po'
import { messages as french } from '../locales/fr/messages.po'
import { errors } from '#/i18n/known-errors'
import { registerErrorTranslations } from '#/i18n/errors'
import { CodeEditor } from './code-editor'

it('updates inline diagnostics without replacing the editor or its unsaved content', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  Object.defineProperty(Range.prototype, 'getClientRects', {
    configurable: true,
    value: () => [],
  })
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => new DOMRect(),
  })
  const i18n = setupI18n({
    locale: 'en',
    messages: { en: english, fr: french },
  })
  registerErrorTranslations(i18n, errors)
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  const source = 'title: unsaved'
  const diagnostic = "Alias '*loop' creates a circular reference."
  try {
    await act(async () =>
      root.render(
        <I18nProvider i18n={i18n}>
          <CodeEditor
            label="Configuration"
            value={source}
            format="yaml"
            onChange={() => {}}
            diagnostics={[
              { from: 0, to: 5, severity: 'error', message: diagnostic },
            ]}
          />
        </I18nProvider>,
      ),
    )
    const content = host.querySelector<HTMLElement>('.cm-content')!
    const view = EditorView.findFromDOM(content)!
    const messages = () => {
      const result: string[] = []
      forEachDiagnostic(view.state, (item) => result.push(item.message))
      return result
    }
    expect(messages()).toEqual([diagnostic])
    await act(async () => i18n.activate('fr'))
    expect(
      EditorView.findFromDOM(host.querySelector<HTMLElement>('.cm-content')!),
    ).toBe(view)
    expect(view.state.doc.toString()).toBe(source)
    expect(messages()).toEqual([
      'L’alias « *loop » crée une référence circulaire.',
    ])
  } finally {
    await act(async () => root.unmount())
    host.remove()
    vi.unstubAllGlobals()
  }
})

it('highlights YAML configuration keys and comments', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  Object.defineProperty(Range.prototype, 'getClientRects', {
    configurable: true,
    value: () => [],
  })
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => new DOMRect(),
  })
  const i18n = setupI18n({ locale: 'en', messages: { en: english } })
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  try {
    await act(async () =>
      root.render(
        <I18nProvider i18n={i18n}>
          <CodeEditor
            label="Configuration"
            value={'# comment\ncontent: []'}
            format="yaml"
            onChange={() => {}}
          />
        </I18nProvider>,
      ),
    )
    const lines = host.querySelectorAll('.cm-line')
    expect(lines[0].querySelector('span')?.textContent).toBe('# comment')
    expect(lines[1].querySelector('span')?.textContent).toBe('content')
  } finally {
    await act(async () => root.unmount())
    host.remove()
    vi.unstubAllGlobals()
  }
})
