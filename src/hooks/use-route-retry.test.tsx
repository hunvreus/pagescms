// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { expect, it, vi } from 'vitest'
import { useRouteRetry } from './use-route-retry'

it('reruns a failed loader without refetching healthy ancestors', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const parentLoader = vi.fn(() => 'parent')
  const loader = vi
    .fn()
    .mockRejectedValueOnce(new Error('temporary failure'))
    .mockResolvedValue('recovered')
  const rootRoute = createRootRoute({
    component: Outlet,
    loader: parentLoader,
    staleTime: Infinity,
  })
  function ErrorState({ reset }: { reset: () => void }) {
    const { retry, retrying } = useRouteRetry(reset)
    return (
      <button disabled={retrying} onClick={() => void retry()}>
        Retry
      </button>
    )
  }
  const child = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    loader,
    component: () => <p>Recovered</p>,
    errorComponent: ErrorState,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([child]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
    defaultPendingMinMs: 0,
  })
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  const warning = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    await router.load()
    await act(async () => {
      root.render(<RouterProvider router={router} />)
    })
    expect(host.textContent).toBe('Retry')
    await act(async () => {
      host.querySelector('button')!.click()
      await new Promise((resolve) => setTimeout(resolve, 30))
    })
    expect(loader).toHaveBeenCalledTimes(2)
    expect(parentLoader).toHaveBeenCalledTimes(1)
    expect(host.textContent).toBe('Recovered')
  } finally {
    await act(async () => root.unmount())
    host.remove()
    warning.mockRestore()
    vi.unstubAllGlobals()
  }
})

it('retries a suspense query thrown during render when its route loader succeeded', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const {
    QueryClient,
    QueryClientProvider,
    QueryErrorResetBoundary,
    useSuspenseQuery,
  } = await import('@tanstack/react-query')
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const fetch = vi
    .fn()
    .mockRejectedValueOnce(new Error('temporary query failure'))
    .mockResolvedValue('Recovered query')
  function Page() {
    const { data } = useSuspenseQuery({
      queryKey: ['render-retry'],
      queryFn: fetch,
    })
    return <p>{data}</p>
  }
  function ErrorState({ reset }: { reset: () => void }) {
    const { retry } = useRouteRetry(reset)
    return <button onClick={() => void retry()}>Retry query</button>
  }
  const rootRoute = createRootRoute({ component: Outlet, staleTime: Infinity })
  const child = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: Page,
    errorComponent: ErrorState,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([child]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
    defaultPendingMinMs: 0,
  })
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  const warning = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    await router.load()
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <QueryErrorResetBoundary>
            <RouterProvider router={router} />
          </QueryErrorResetBoundary>
        </QueryClientProvider>,
      )
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 60))
    })
    expect(host.textContent).toBe('Retry query')
    await act(async () => {
      host.querySelector('button')!.click()
      await new Promise((resolve) => setTimeout(resolve, 60))
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 60))
    })
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(host.textContent).toBe('Recovered query')
  } finally {
    await act(async () => root.unmount())
    queryClient.clear()
    host.remove()
    warning.mockRestore()
    vi.unstubAllGlobals()
  }
})
