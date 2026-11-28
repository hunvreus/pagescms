import { TestI18n } from '#/i18n/test-provider'
// @vitest-environment jsdom
import { act } from 'react'
import { setupI18n } from '@lingui/core'
import { createRoot } from 'react-dom/client'
import {
  createMemoryHistory,
  createRootRoute,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { expect, it, vi } from 'vitest'
import { attachStandalonePluginRoutes } from './standalone-plugin-routes'

vi.mock('./standalone-plugin-page', () => ({
  StandalonePluginPage: ({ search }: { search: string }) => (
    <output>{search}</output>
  ),
}))

it('routes exact public pages, preserves signed queries and reserves their namespace', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  window.scrollTo = vi.fn()
  const i18n = setupI18n({
    locale: 'fr',
    messages: { fr: { 'test.consent': ['Consentement'] } },
  })
  const root = createRootRouteWithContext<{
    i18n: ReturnType<typeof setupI18n>
  }>()()
  const repository = vi.fn()
  const repo = createRoute({
    getParentRoute: () => root,
    path: 'github/$owner/$repo',
    loader: repository,
    component: () => <span>Repository</span>,
  })
  root.addChildren([repo])
  const pages = {
    'test/consent': {
      path: '/connect/consent',
      title: { id: 'test.consent', message: 'Consent' },
      load: async () => ({ default: () => null }),
    },
  }
  attachStandalonePluginRoutes(root, pages)
  // Re-registering after hot reload must replace owned routes, not collide.
  attachStandalonePluginRoutes(root, pages)
  const query = 'ba_param=one&ba_param=two&sig=a%2Bb%3D'
  const router = createRouter({
    context: { i18n },
    defaultNotFoundComponent: () => <p>Page unavailable</p>,
    routeTree: root,
    history: createMemoryHistory({
      initialEntries: [`/connect/consent?${query}`],
    }),
  })
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createRoot(host)
  try {
    await act(async () => {
      await router.load()
      app.render(<TestI18n>{<RouterProvider router={router} />}</TestI18n>)
    })
    expect(host.querySelector('output')?.textContent).toBe(query)
    expect(router.state.matches.at(-1)?.meta?.[0]).toEqual({
      title: 'Consentement | Pages CMS',
    })
    expect(repository).not.toHaveBeenCalled()
    await act(async () => {
      router.history.push('/connect/missing')
      await router.load()
    })
    expect(host.textContent).toContain('Page unavailable')
    expect(repository).not.toHaveBeenCalled()
    await act(async () => {
      router.history.push('/github/connect/repository')
      await router.load()
    })
    expect(repository).toHaveBeenCalledOnce()
  } finally {
    await act(async () => app.unmount())
    host.remove()
    vi.unstubAllGlobals()
  }
})

it('rejects a namespace already owned by a core route before router initialization', () => {
  const root = createRootRoute()
  root.addChildren([
    createRoute({ getParentRoute: () => root, path: 'connect' }),
  ])
  expect(() =>
    attachStandalonePluginRoutes(root, {
      'test/consent': {
        path: '/connect/consent',
        title: 'Consent',
        load: async () => ({ default: () => null }),
      },
    }),
  ).toThrow('Conflicting standalone page namespace connect')
})
