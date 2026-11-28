// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
} from '@tanstack/react-router'
import { componentLoader } from './component-loader'
import {
  preloadDestination,
  startComponentPreloading,
} from './component-preloading'

afterEach(() => {
  document.body.replaceChildren()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

it('shares a component import with rendering and retries a failed speculative import', async () => {
  const module = { default: () => null }
  const load = vi
    .fn()
    .mockRejectedValueOnce(new Error('Offline'))
    .mockResolvedValue(module)
  const cached = componentLoader(load)
  const first = cached()
  expect(cached()).toBe(first)
  await expect(first).rejects.toThrow('Offline')
  await expect(cached()).resolves.toBe(module)
  expect(load).toHaveBeenCalledTimes(2)
  await cached()
  expect(load).toHaveBeenCalledTimes(2)
})

it('loads real router components and hosted contribution code without running loaders or access guards', async () => {
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  const beforeLoad = vi.fn()
  const loader = vi.fn()
  const loadComponent = vi.fn(async () => ({ default: () => null }))
  const root = createRootRoute()
  const page = createRoute({
    getParentRoute: () => root,
    path: '/github/$owner/$repo/$branch/$page',
    beforeLoad,
    loader,
    component: lazyRouteComponent(loadComponent),
  })
  const router = createRouter({
    routeTree: root.addChildren([page]),
    history: createMemoryHistory(),
  })
  const extras = {
    plugin: vi.fn(async (_key: string) => {}),
    editor: vi.fn(async () => {}),
  }
  await preloadDestination(
    router,
    new URL('http://localhost/github/owner/site/main/storage'),
    false,
    extras,
  )
  expect(loadComponent).toHaveBeenCalledOnce()
  expect(extras.plugin).toHaveBeenCalledExactlyOnceWith('storage')
  expect(extras.editor).not.toHaveBeenCalled()
  expect(beforeLoad).not.toHaveBeenCalled()
  expect(loader).not.toHaveBeenCalled()
  expect(fetch).not.toHaveBeenCalled()
})

it('warms nested editor implementations only for an editor destination with intent', async () => {
  const root = createRootRoute()
  const entry = createRoute({
    getParentRoute: () => root,
    path: '/github/$owner/$repo/$branch/collection/$name/entry/$',
    component: () => null,
  })
  const router = createRouter({
    routeTree: root.addChildren([entry]),
    history: createMemoryHistory(),
  })
  const extras = {
    plugin: vi.fn(async (_key: string) => {}),
    editor: vi.fn(async () => {}),
  }
  const url = new URL(
    'http://localhost/github/owner/site/main/collection/posts/entry/posts/hello.md',
  )
  await preloadDestination(router, url, false, extras)
  expect(extras.editor).not.toHaveBeenCalled()
  await preloadDestination(router, url, true, extras)
  expect(extras.editor).toHaveBeenCalledOnce()
})

function observeLinks() {
  let emit: IntersectionObserverCallback = () => {}
  const observe = vi.fn()
  const disconnect = vi.fn()
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: IntersectionObserverCallback) {
        emit = callback
      }
      observe = observe
      unobserve = vi.fn()
      disconnect = disconnect
    },
  )
  return {
    observe,
    disconnect,
    visible: (anchor: Element, isIntersecting = true) =>
      emit(
        [{ target: anchor, isIntersecting } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      ),
  }
}
function sidebar() {
  document.body.innerHTML =
    '<div data-slot="sidebar-content"><a href="/collection">Collection</a><a href="/offscreen">Offscreen</a></div><a href="https://example.com/">External</a>'
  return [...document.querySelectorAll('a')]
}

it('warms only visible sidebar links during idle and cleans up pending work', async () => {
  vi.useFakeTimers()
  vi.stubGlobal('requestIdleCallback', undefined)
  const observer = observeLinks()
  const [link, offscreen, external] = sidebar()
  const warm = vi.fn(async (_url: URL, _intent: boolean) => {})
  const stop = startComponentPreloading(warm)
  expect(observer.observe).toHaveBeenCalledTimes(2)
  observer.visible(link)
  observer.visible(offscreen, false)
  expect(warm).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(250)
  expect(warm).toHaveBeenCalledOnce()
  expect(warm.mock.calls[0]?.[1]).toBe(false)
  external.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
  expect(warm).toHaveBeenCalledOnce()
  observer.visible(offscreen)
  stop()
  await vi.runAllTimersAsync()
  link.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
  expect(warm).toHaveBeenCalledOnce()
  expect(observer.disconnect).toHaveBeenCalledOnce()
})

it('serializes idle imports and cancels a link that leaves the viewport', async () => {
  vi.useFakeTimers()
  vi.stubGlobal('requestIdleCallback', undefined)
  const observer = observeLinks()
  const [first, second] = sidebar()
  let finish: () => void = () => {}
  const warm = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve
      }),
  )
  const stop = startComponentPreloading(warm)
  observer.visible(first)
  observer.visible(second)
  await vi.advanceTimersByTimeAsync(250)
  expect(warm).toHaveBeenCalledOnce()
  observer.visible(second, false)
  finish()
  await vi.runAllTimersAsync()
  expect(warm).toHaveBeenCalledOnce()
  stop()
})

it('skips idle warming on slow connections but still warms on focus', async () => {
  vi.useFakeTimers()
  vi.stubGlobal(
    'navigator',
    Object.assign(Object.create(navigator), {
      connection: { effectiveType: '2g' },
    }),
  )
  const observer = observeLinks()
  const [link] = sidebar()
  const warm = vi.fn(async (_url: URL, _intent: boolean) => {})
  const stop = startComponentPreloading(warm)
  expect(observer.observe).not.toHaveBeenCalled()
  link.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
  expect(warm).toHaveBeenCalledOnce()
  expect(warm.mock.calls[0]?.[1]).toBe(true)
  stop()
})

it('does not speculate when data saver is enabled', () => {
  vi.stubGlobal(
    'navigator',
    Object.assign(Object.create(navigator), { connection: { saveData: true } }),
  )
  const [link] = sidebar()
  const warm = vi.fn(async (_url: URL, _intent: boolean) => {})
  const stop = startComponentPreloading(warm)
  link.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
  expect(warm).not.toHaveBeenCalled()
  stop()
})

it('discovers sidebar links inserted after hydration and ignores failed speculative loads', async () => {
  vi.useFakeTimers()
  vi.stubGlobal('requestIdleCallback', undefined)
  const observer = observeLinks()
  document.body.innerHTML = '<div data-slot="sidebar-content"></div>'
  const warm = vi.fn(async (_url: URL, _intent: boolean) => {
    throw new Error('Offline')
  })
  const stop = startComponentPreloading(warm)
  const anchor = document.createElement('a')
  anchor.href = '/new-destination'
  document
    .querySelector<HTMLDivElement>('[data-slot="sidebar-content"]')!
    .appendChild(anchor)
  await Promise.resolve()
  expect(observer.observe).toHaveBeenCalledWith(anchor)
  observer.visible(anchor)
  await vi.advanceTimersByTimeAsync(250)
  expect(warm).toHaveBeenCalledOnce()
  // A failed background load does not stop an intentional retry.
  anchor.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
  await Promise.resolve()
  expect(warm).toHaveBeenCalledTimes(2)
  stop()
})
