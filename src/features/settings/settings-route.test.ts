import { QueryClient } from '@tanstack/react-query'
import { afterEach, expect, it, vi } from 'vitest'
import { Route } from '#/routes/settings'
import { accountSettingsQueryOptions } from '#/client/queries/session'

vi.mock('#/features/account/require-profile', () => ({
  requireConfirmedProfile: vi.fn(),
}))
vi.mock('#/features/settings/user-settings', () => ({
  UserSettings: () => null,
}))
vi.mock('#/client/queries/session', () => ({
  accountSettingsQueryOptions: () => ({
    queryKey: ['settings'],
    queryFn: () => state.fetch(),
    staleTime: 60_000,
  }),
}))
const state = vi.hoisted(() => ({ fetch: vi.fn() }))
afterEach(() => {
  vi.resetAllMocks()
})

it.each([false, true])(
  'opens the page while account settings load (cached: %s)',
  async (cached) => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const settings = accountSettingsQueryOptions()
    const key: ReadonlyArray<unknown> = settings.queryKey
    if (cached)
      client.setQueryData(
        key,
        { cached: true },
        { updatedAt: Date.now() - 120_000 },
      )
    let finish!: (data: unknown) => void
    state.fetch.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const loader = Route.options.loader
    if (typeof loader !== 'function') throw new Error('Settings loader missing')
    let settled = false
    const result = loader({
      context: { queryClient: client },
      location: { href: '/settings' },
    } as Parameters<typeof loader>[0])
    const completed = Promise.resolve(result).then(() => {
      settled = true
    })
    await vi.waitFor(() => expect(state.fetch).toHaveBeenCalledTimes(1))
    // Drain loader microtasks while the provider request remains pending.
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(settled).toBe(true)
    if (cached)
      expect(client.getQueryData(settings.queryKey)).toEqual({ cached: true })
    finish({ refreshed: true })
    await completed
    await vi.waitFor(() =>
      expect(client.getQueryData(settings.queryKey)).toEqual({
        refreshed: true,
      }),
    )
    client.clear()
  },
)
