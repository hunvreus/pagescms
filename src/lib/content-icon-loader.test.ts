import NewsIcon from '@hugeicons/core-free-icons/News01Icon'
import { afterEach, expect, it, vi } from 'vitest'
import { loadContentIcon } from './content-icon-loader'

afterEach(() => vi.unstubAllGlobals())

it('loads the named icon once and preserves its SVG data', async () => {
  const fetchIcon = vi.fn(
    async () =>
      new Response(JSON.stringify(NewsIcon), {
        headers: { 'content-type': 'application/json' },
      }),
  )
  vi.stubGlobal('fetch', fetchIcon)
  const first = loadContentIcon('News01Icon')
  expect(loadContentIcon('News01')).toBe(first)
  expect(await first).toEqual(NewsIcon)
  expect(fetchIcon).toHaveBeenCalledWith('/configured-icons/News01Icon.json')
  expect(fetchIcon).toHaveBeenCalledOnce()
})

it('keeps the fallback for invalid and missing names', async () => {
  const fetchIcon = vi.fn(async () => new Response(null, { status: 404 }))
  vi.stubGlobal('fetch', fetchIcon)
  expect(await loadContentIcon('../bad')).toBeUndefined()
  expect(fetchIcon).not.toHaveBeenCalled()
  expect(await loadContentIcon('MissingConfigured123Icon')).toBeUndefined()
})
