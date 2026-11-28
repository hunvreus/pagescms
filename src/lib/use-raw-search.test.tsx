import { TestI18n } from '#/i18n/test-provider'
// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { expect, it, vi } from 'vitest'
import { useRawSearch } from './use-raw-search'

it('preserves repeated query parameters and signed values across navigation', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  window.scrollTo = vi.fn()
  const rootRoute = createRootRoute()
  const route = createRoute({
    getParentRoute: () => rootRoute,
    path: '/external',
    component: () => <output>{useRawSearch()}</output>,
  })
  const original =
    'tag=first&tag=second&number=001&flag=true&signature=a%2Bb%2Fc%3D'
  const history = createMemoryHistory({
    initialEntries: [`/external?${original}`],
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([route]),
    history,
  })
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  try {
    await act(async () => {
      await router.load()
      root.render(<TestI18n>{<RouterProvider router={router} />}</TestI18n>)
    })
    expect(router.state.location.searchStr).not.toBe(`?${original}`)
    expect(host.querySelector('output')?.textContent).toBe(original)
    const next = 'tag=third&tag=fourth&signature=x%2By%3D'
    await act(async () => {
      history.push(`/external?${next}`)
      await router.load()
    })
    expect(host.querySelector('output')?.textContent).toBe(next)
    await act(async () => {
      history.push('/external')
      await router.load()
    })
    expect(host.querySelector('output')?.textContent).toBe('')
  } finally {
    await act(async () => root.unmount())
    host.remove()
    vi.unstubAllGlobals()
  }
})
