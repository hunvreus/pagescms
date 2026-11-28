import { TestI18n } from '#/i18n/test-provider'
// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { useSidebarScroll } from './use-sidebar-scroll'

it('shows the footer separator only while overflowing content remains below', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  let resize = () => {}
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        resize = callback
      }
      observe() {}
      disconnect() {}
    },
  )
  function Sidebar() {
    const { ref, showFooterBorder } = useSidebarScroll()
    return <div ref={ref} data-border={showFooterBorder} />
  }
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  try {
    await act(async () => root.render(<TestI18n>{<Sidebar />}</TestI18n>))
    const content = host.firstElementChild as HTMLDivElement
    expect(content.dataset.border).toBe('false')
    const dimensions = { scrollHeight: 100, clientHeight: 100, scrollTop: 0 }
    for (const key of ['scrollHeight', 'clientHeight', 'scrollTop'] as const)
      Object.defineProperty(content, key, { get: () => dimensions[key] })
    await act(async () => resize())
    expect(content.dataset.border).toBe('false')
    dimensions.scrollHeight = 300
    await act(async () => resize())
    expect(content.dataset.border).toBe('true')
    dimensions.scrollTop = 200
    await act(async () => content.dispatchEvent(new Event('scroll')))
    expect(content.dataset.border).toBe('false')
    dimensions.scrollTop = 50
    await act(async () => content.dispatchEvent(new Event('scroll')))
    expect(content.dataset.border).toBe('true')
    dimensions.scrollTop = 0
    dimensions.clientHeight = 400
    await act(async () => resize())
    expect(content.dataset.border).toBe('false')
  } finally {
    await act(async () => root.unmount())
    host.remove()
    vi.unstubAllGlobals()
  }
})
