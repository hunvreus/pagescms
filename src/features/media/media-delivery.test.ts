import { TestI18n } from '#/i18n/test-provider'
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { MediaThumbnail } from '#/components/media-thumbnail'
import { refreshMedia } from './media-mutations'
import type { MediaImageState } from './media-delivery'
import { bindMediaImage, mediaAssetQueryOptions } from './media-delivery'

const api = vi.hoisted(() => vi.fn())
vi.mock('#/client/api/media', () => ({ getMediaDelivery: api }))
const ref = {
  owner: 'o',
  repo: 'r',
  branch: 'main',
  name: 'images',
  variant: 'thumbnail' as const,
}
let client: QueryClient
let seen: Set<Element>
let intersection: IntersectionObserverCallback
let stops: Array<() => void>
let version: string | null

function image(
  path: string,
  changed?: (state: MediaImageState) => void,
  revision?: string,
) {
  const element = document.createElement('img')
  document.body.appendChild(element)
  const binding = bindMediaImage(
    client,
    { ...ref, path, revision },
    element,
    changed,
  )
  stops.push(binding.destroy)
  return { element, binding }
}
function visible(...elements: Element[]) {
  intersection(
    elements.map((target) => ({
      target,
      isIntersecting: true,
    })) as IntersectionObserverEntry[],
    {} as IntersectionObserver,
  )
}
const flush = () => vi.advanceTimersByTimeAsync(25)

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-04T00:00:00Z'))
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: 'visible',
  })
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  seen = new Set()
  stops = []
  version = 'v1'
  api.mockReset()
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: IntersectionObserverCallback) {
        intersection = callback
      }
      observe(target: Element) {
        seen.add(target)
      }
      unobserve(target: Element) {
        seen.delete(target)
      }
      disconnect() {
        seen.clear()
      }
    },
  )
  api.mockImplementation(async (data) => ({
    delivery: 'direct',
    provider: 'github',
    errors: [],
    leases: data.paths.map((path: string) => ({
      assetId: path,
      path,
      cacheKey: version,
      url: `https://raw.example/${path}?token=${api.mock.calls.length}`,
      expiresAt: new Date(Date.now() + 300000).toISOString(),
    })),
  }))
})
afterEach(() => {
  for (const stop of stops) stop()
  client.clear()
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('shared image delivery', () => {
  it.each([true, false])(
    'uses an initial image URL only while it is valid (valid: %s)',
    async (valid) => {
      const path = 'images/initial.png'
      const element = document.createElement('img')
      document.body.appendChild(element)
      const binding = bindMediaImage(
        client,
        { ...ref, path },
        element,
        undefined,
        {
          assetId: path,
          path,
          cacheKey: 'v1',
          url: 'https://raw.example/initial.png?token=initial',
          expiresAt: new Date(
            Date.now() + (valid ? 300_000 : -1_000),
          ).toISOString(),
        },
      )
      stops.push(binding.destroy)
      visible(element)
      await flush()
      expect(api).toHaveBeenCalledTimes(valid ? 0 : 1)
      expect(element.src).toContain(valid ? 'token=initial' : 'token=1')
    },
  )

  it('only resolves near-visible images and batches independent views by parent directory', async () => {
    const a = image('images/a.png')
    const b = image('images/b.png')
    image('images/offscreen.png')
    await flush()
    expect(api).not.toHaveBeenCalled()
    visible(a.element, b.element)
    await flush()
    expect(api).toHaveBeenCalledTimes(1)
    expect(api.mock.calls[0][0].paths).toEqual(['images/a.png', 'images/b.png'])
    expect(a.element.src).toContain('token=1')
    expect(b.element.src).toContain('token=1')
  })

  it('refreshes URL leases without downloading loaded unchanged content, but replaces changed content', async () => {
    const a = image('images/a.png')
    visible(a.element)
    await flush()
    a.element.dispatchEvent(new Event('load'))
    const original = a.element.src
    const writes = vi.spyOn(a.element, 'src', 'set')
    void client.invalidateQueries({
      queryKey: mediaAssetQueryOptions(client, { ...ref, path: 'images/a.png' })
        .queryKey,
    })
    await flush()
    expect(api).toHaveBeenCalledTimes(2)
    expect(a.element.src).toBe(original)
    expect(writes).not.toHaveBeenCalled()
    version = 'v2'
    void client.invalidateQueries({
      queryKey: mediaAssetQueryOptions(client, { ...ref, path: 'images/a.png' })
        .queryKey,
    })
    await flush()
    expect(writes).toHaveBeenCalledTimes(1)
    expect(a.element.src).toContain('token=3')
  })

  it('resolves a newly added file without changing existing mounted images', async () => {
    const a = image('images/a.png')
    visible(a.element)
    await flush()
    a.element.dispatchEvent(new Event('load'))
    const original = a.element.src
    const b = image('images/new.png')
    visible(b.element)
    await flush()
    expect(api.mock.calls[1][0].paths).toEqual(['images/new.png'])
    expect(a.element.src).toBe(original)
  })

  it('keeps loaded images without expiry or focus renewal, but renews before reuse on a new image', async () => {
    const a = image('images/a.png')
    visible(a.element)
    await flush()
    a.element.dispatchEvent(new Event('load'))
    const original = a.element.src
    await vi.advanceTimersByTimeAsync(360000)
    expect(api).toHaveBeenCalledTimes(1)
    vi.setSystemTime(new Date(Date.now() + 360000))
    document.dispatchEvent(new Event('visibilitychange'))
    await flush()
    expect(api).toHaveBeenCalledTimes(1)
    expect(a.element.src).toBe(original)
    const b = image('images/a.png')
    const writes = vi.spyOn(b.element, 'src', 'set')
    visible(b.element)
    await flush()
    expect(api).toHaveBeenCalledTimes(2)
    expect(api.mock.calls[1][0].forceRefresh).toBe(true)
    expect(a.element.src).toBe(original)
    expect(b.element.src).toContain('token=2')
    expect(writes.mock.calls.flat()).not.toContain(original)
  })

  it('replaces an unversioned provider image after explicit invalidation', async () => {
    api.mockImplementation(async (data) => ({
      provider: 's3',
      delivery: 'direct',
      errors: [],
      leases: data.paths.map((path: string) => ({
        assetId: path,
        path,
        cacheKey: null,
        url: `https://bucket.example/${path}?signature=${api.mock.calls.length}`,
        expiresAt: new Date(Date.now() + 300000).toISOString(),
      })),
    }))
    const a = image('images/a.png')
    visible(a.element)
    await flush()
    a.element.dispatchEvent(new Event('load'))
    await vi.advanceTimersByTimeAsync(360000)
    const b = image('images/a.png')
    visible(b.element)
    await flush()
    expect(a.element.src).toContain('signature=1')
    expect(b.element.src).toContain('signature=2')
    await client.invalidateQueries({
      queryKey: mediaAssetQueryOptions(client, {
        ...ref,
        path: 'images/a.png',
      }).queryKey,
      refetchType: 'none',
    })
    document.dispatchEvent(new Event('visibilitychange'))
    await flush()
    expect(a.element.src).toContain('signature=3')
  })

  it('bounds automatic error retries and permits a later explicit retry', async () => {
    const a = image('images/a.png')
    visible(a.element)
    await flush()
    a.element.dispatchEvent(new Event('error'))
    await vi.advanceTimersByTimeAsync(525)
    expect(api.mock.calls[1][0].forceRefresh).toBe(true)
    a.element.dispatchEvent(new Event('error'))
    await vi.advanceTimersByTimeAsync(525)
    expect(api).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(360000)
    expect(api).toHaveBeenCalledTimes(2)
    a.binding.retry()
    await flush()
    expect(api).toHaveBeenCalledTimes(3)
    a.element.dispatchEvent(new Event('load'))
    a.element.dispatchEvent(new Event('error'))
    await vi.advanceTimersByTimeAsync(525)
    expect(api).toHaveBeenCalledTimes(4)
  })

  it('never applies an expired lease when reusing a loaded image for another path', async () => {
    const a = image('images/a.png')
    visible(a.element)
    await flush()
    a.element.dispatchEvent(new Event('load'))
    a.binding.destroy()
    Object.defineProperty(a.element, 'complete', {
      configurable: true,
      value: true,
    })
    Object.defineProperty(a.element, 'naturalWidth', {
      configurable: true,
      value: 10,
    })
    const input = { ...ref, path: 'images/b.png' }
    const expired = 'https://raw.example/b.png?expired'
    client.setQueryData(mediaAssetQueryOptions(client, input).queryKey, {
      assetId: input.path,
      path: input.path,
      cacheKey: 'old-b',
      url: expired,
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    })
    const writes = vi.spyOn(a.element, 'src', 'set')
    const binding = bindMediaImage(client, input, a.element)
    stops.push(binding.destroy)
    visible(a.element)
    await flush()
    expect(writes.mock.calls.flat()).not.toContain(expired)
    expect(a.element.src).toContain('token=2')
  })

  it('retains a known S3 revision through folder invalidation without extra metadata reads', async () => {
    version = null
    const a = image('images/a.png', undefined, 'etag-a')
    visible(a.element)
    await flush()
    a.element.dispatchEvent(new Event('load'))
    const original = a.element.src
    void client.invalidateQueries({
      queryKey: mediaAssetQueryOptions(client, {
        ...ref,
        path: 'images/a.png',
        revision: 'etag-a',
      }).queryKey,
    })
    await flush()
    expect(api).toHaveBeenCalledTimes(2)
    expect(a.element.src).toBe(original)
  })

  it('settles a skipped hidden-tab retry into an actionable failed state', async () => {
    const states: MediaImageState[] = []
    const a = image('images/a.png', (state) => states.push(state))
    visible(a.element)
    await flush()
    a.element.dispatchEvent(new Event('error'))
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    })
    await vi.advanceTimersByTimeAsync(525)
    expect(states.at(-1)).toMatchObject({ failed: true, loading: false })
    expect(api).toHaveBeenCalledTimes(1)
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    })
    a.binding.retry()
    await flush()
    expect(api).toHaveBeenCalledTimes(2)
  })

  it('uses repository identity from a mounted thumbnail when invalidating after a mutation', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const coordinates = { ...ref, repoId: '42', source: 'github.com' }
    try {
      await act(async () =>
        root.render(
          createElement(TestI18n, {
            children: createElement(
              QueryClientProvider,
              { client },
              createElement(MediaThumbnail, {
                ...coordinates,
                source: undefined,
                repositorySource: coordinates.source,
                path: 'images/a.png',
              }),
            ),
          }),
        ),
      )
      const element = host.querySelector('img')!
      await act(async () => {
        visible(element)
        await flush()
      })
      await act(async () => element.dispatchEvent(new Event('load')))
      version = 'v2'
      await act(async () => {
        refreshMedia(client, coordinates, ['images'])
        await flush()
      })
      expect(api).toHaveBeenCalledTimes(2)
      expect(api.mock.calls[1][0]).toMatchObject({
        repoId: '42',
        source: 'github.com',
      })
      expect(element.src).toContain('token=2')
    } finally {
      await act(async () => root.unmount())
      host.remove()
    }
  })

  it('discards a late response after session cache clearing', async () => {
    let finish!: (value: unknown) => void
    api.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const a = image('images/a.png')
    visible(a.element)
    await flush()
    client.clear()
    finish({
      leases: [
        {
          path: 'images/a.png',
          cacheKey: 'v1',
          url: 'https://raw.example/private',
          expiresAt: null,
        },
      ],
      errors: [],
    })
    await flush()
    expect(a.element.getAttribute('src')).toBeNull()
    expect(client.getQueryCache().getAll()).toHaveLength(0)
  })
})
