import { TestI18n } from '#/i18n/test-provider'
// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import type { ComponentProps } from 'react'
import { SettingsBackLink } from './settings-back-link'

const history = vi.hoisted(() => ({ canGoBack: false, back: vi.fn() }))
vi.mock('@tanstack/react-router', () => ({
  useCanGoBack: () => history.canGoBack,
  useRouter: () => ({ history: { back: history.back } }),
  Link: ({ to, ...props }: ComponentProps<'a'> & { to: string }) => (
    <a href={to} {...props} />
  ),
}))
let root: Root
let host: HTMLDivElement
async function render(canGoBack: boolean) {
  history.canGoBack = canGoBack
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () =>
    root.render(
      <TestI18n>{<SettingsBackLink className="sidebar-link" />}</TestI18n>,
    ),
  )
  return host.querySelector('a')!
}
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})
it('returns through router history when an in-app predecessor exists', async () => {
  const link = await render(true)
  const click = new MouseEvent('click', {
    bubbles: true,
    cancelable: true,
    button: 0,
  })
  await act(async () => {
    link.dispatchEvent(click)
  })
  expect(click.defaultPrevented).toBe(true)
  expect(history.back).toHaveBeenCalledOnce()
  expect(link.className).toBe('sidebar-link')
})
it('keeps the home link for direct/external arrivals and modified clicks', async () => {
  const link = await render(false)
  expect(link.getAttribute('href')).toBe('/')
  const click = new MouseEvent('click', {
    bubbles: true,
    cancelable: true,
    button: 0,
  })
  await act(async () => {
    link.dispatchEvent(click)
  })
  expect(click.defaultPrevented).toBe(false)
  expect(history.back).not.toHaveBeenCalled()
  history.canGoBack = true
  await act(async () =>
    root.render(<TestI18n>{<SettingsBackLink />}</TestI18n>),
  )
  const modified = new MouseEvent('click', {
    bubbles: true,
    cancelable: true,
    button: 0,
    metaKey: true,
  })
  await act(async () => {
    host.querySelector('a')!.dispatchEvent(modified)
  })
  expect(modified.defaultPrevented).toBe(false)
  expect(history.back).not.toHaveBeenCalled()
})
