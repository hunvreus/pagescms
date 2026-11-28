import type { AnyRouter } from '@tanstack/react-router'

type ComponentRouter = Pick<AnyRouter, 'getMatchedRoutes' | 'loadRouteChunk'>
type Warm = (url: URL, intent: boolean) => Promise<void>
type Connection = { saveData?: boolean; effectiveType?: string }

/** Load route code without invoking beforeLoad, loaders, or query prefetches. */
export async function preloadDestination(
  router: ComponentRouter,
  url: URL,
  intent: boolean,
  extras: {
    plugin: (key: string) => Promise<void>
    editor: () => Promise<void>
  },
) {
  const [routes, params, found] = router.getMatchedRoutes(url.pathname)
  if (!found) return
  const loads = routes.map((route) => router.loadRouteChunk(route))
  if (params.page) loads.push(extras.plugin(decodeURIComponent(params.page)))
  if (
    intent &&
    (found.fullPath.includes('/entry/$') ||
      found.fullPath.endsWith('/file/$name') ||
      found.fullPath.endsWith('/collection/$name/new'))
  )
    loads.push(extras.editor())
  await Promise.all(loads)
}

/** Browser-only enhancement. Speculative failures never block normal navigation. */
export function startComponentPreloading(warm: Warm) {
  const connection = (navigator as Navigator & { connection?: Connection })
    .connection
  if (connection?.saveData) return () => {}
  const idleAllowed = !['slow-2g', '2g', '3g'].includes(
    connection?.effectiveType ?? '',
  )
  let stopped = false
  let idle: number | undefined
  let running = false
  const queued = new Set<HTMLAnchorElement>()
  const visible = new Set<HTMLAnchorElement>()
  const observed = new Set<HTMLAnchorElement>()
  const idleApi = typeof window.requestIdleCallback === 'function'

  function destination(anchor: HTMLAnchorElement) {
    if (
      anchor.hasAttribute('download') ||
      (anchor.target && anchor.target !== '_self')
    )
      return
    const url = new URL(anchor.href, window.location.href)
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.origin !== window.location.origin
    )
      return
    if (
      url.pathname === window.location.pathname &&
      url.search === window.location.search
    )
      return
    return url
  }
  function schedule() {
    if (stopped || running || idle !== undefined || !queued.size) return
    idle = idleApi
      ? window.requestIdleCallback(() => void next(), { timeout: 2500 })
      : window.setTimeout(() => void next(), 250)
  }
  async function next() {
    idle = undefined
    if (stopped) return
    const anchor = queued.values().next().value
    if (!anchor) return
    queued.delete(anchor)
    const url =
      anchor.isConnected && visible.has(anchor)
        ? destination(anchor)
        : undefined
    running = true
    try {
      if (url) await warm(url, false)
    } catch {
      /* Navigation retries failed imports. */
    }
    running = false
    schedule()
  }
  function intent(event: Event) {
    if (!(event.target instanceof Element)) return
    const anchor = event.target.closest<HTMLAnchorElement>('a[href]')
    if (!anchor) return
    const url = destination(anchor)
    if (url) void warm(url, true).catch(() => {})
  }
  const observer =
    idleAllowed && typeof IntersectionObserver !== 'undefined'
      ? new IntersectionObserver((entries) => {
          for (const entry of entries) {
            const anchor = entry.target as HTMLAnchorElement
            if (entry.isIntersecting) {
              if (!visible.has(anchor)) queued.add(anchor)
              visible.add(anchor)
            } else {
              visible.delete(anchor)
              queued.delete(anchor)
            }
          }
          schedule()
        })
      : undefined
  function scan() {
    if (!observer) return
    for (const anchor of observed) {
      if (!anchor.isConnected) {
        observer.unobserve(anchor)
        observed.delete(anchor)
        visible.delete(anchor)
        queued.delete(anchor)
      }
    }
    for (const anchor of document.querySelectorAll<HTMLAnchorElement>(
      '[data-slot="sidebar-content"] a[href]',
    )) {
      if (!observed.has(anchor)) {
        observed.add(anchor)
        observer.observe(anchor)
      }
    }
  }
  const changes = observer ? new MutationObserver(scan) : undefined
  changes?.observe(document.body, { childList: true, subtree: true })
  scan()
  document.addEventListener('mouseover', intent, { passive: true })
  document.addEventListener('focusin', intent)
  document.addEventListener('touchstart', intent, { passive: true })
  return () => {
    stopped = true
    if (idle !== undefined) {
      if (idleApi) window.cancelIdleCallback(idle)
      else window.clearTimeout(idle)
    }
    observer?.disconnect()
    changes?.disconnect()
    queued.clear()
    document.removeEventListener('mouseover', intent)
    document.removeEventListener('focusin', intent)
    document.removeEventListener('touchstart', intent)
  }
}
