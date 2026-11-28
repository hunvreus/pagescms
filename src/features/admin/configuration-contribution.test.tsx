// @vitest-environment jsdom
import { act, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { ConfigurationContribution } from './configuration-contribution'

const mocks = vi.hoisted(() => ({ auth: vi.fn(), load: vi.fn() }))
vi.mock('#pagescms/deployment/client', () => ({
  default: { ui: { configurationEditor: mocks.load } },
}))
vi.mock('@tanstack/react-query', () => ({ useSuspenseQuery: mocks.auth }))
vi.mock('#/client/queries/session', () => ({
  authenticationQueryOptions: () => ({}),
}))
let root: Root | undefined
async function render(ui: React.ReactNode) {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const container = document.createElement('div')
  document.body.appendChild(container)
  const currentRoot = createRoot(container)
  root = currentRoot
  await act(async () => {
    currentRoot.render(ui)
  })
}
afterEach(async () => {
  await act(async () => root?.unmount())
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

it('retains the independent editor when optional authentication fails', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mocks.auth.mockImplementation(() => {
    throw new Error('Auth unavailable')
  })
  await render(
    <>
      <input aria-label="Configuration editor" />
      <Suspense fallback={null}>
        <ConfigurationContribution
          owner="a"
          repo="b"
          branch="main"
          source=""
          disabled={false}
          onChange={() => {}}
          setup={<p>Manual setup</p>}
        />
      </Suspense>
    </>,
  )
  expect(document.body.textContent).toContain('Manual setup')
  expect(
    document.querySelector('[aria-label="Configuration editor"]'),
  ).toBeTruthy()
})

it('retains the independent editor when the optional module fails', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mocks.auth.mockReturnValue({ data: { user: { id: 'u' } } })
  mocks.load.mockRejectedValue(new Error('Module unavailable'))
  await render(
    <>
      <input aria-label="Configuration editor" />
      <Suspense fallback={null}>
        <ConfigurationContribution
          owner="a"
          repo="b"
          branch="main"
          source=""
          disabled={false}
          onChange={() => {}}
          setup={<p>Manual setup</p>}
        />
      </Suspense>
    </>,
  )
  expect(document.body.textContent).toContain('Manual setup')
  expect(
    document.querySelector('[aria-label="Configuration editor"]'),
  ).toBeTruthy()
})
