import { TestI18n } from '#/i18n/test-provider'
// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { UserSettings } from './user-settings'
import { authenticationQueryOptions } from '#/client/queries/session'

const api = vi.hoisted(() => ({ settings: vi.fn() }))
vi.mock('#/client/api/account', () => ({ getAccountSettings: api.settings }))
vi.mock('#/components/settings-layout', () => ({
  SettingsLayout: ({ children }: { children: React.ReactNode }) => (
    <main>{children}</main>
  ),
}))
vi.mock('#/features/account/profile-settings', () => ({
  ProfileSettings: ({ user }: { user: { name: string } }) => (
    <label>
      Profile name
      <input defaultValue={user.name} />
    </label>
  ),
}))
vi.mock('#/features/account/content-editing-preferences', () => ({
  ContentEditingPreferences: () => <p>Independent preferences</p>,
}))
vi.mock('./account-settings-contribution', () => ({
  AccountSettingsContribution: () => <p>Independent hosted sections</p>,
  AccountSettingsLoading: () => null,
}))
vi.mock('#/features/account/delete-account', () => ({
  DeleteAccount: () => <p>Danger zone</p>,
}))
vi.mock('./settings-navigation', () => ({ accountNavigation: [] }))
let root: Root | undefined
afterEach(async () => {
  if (root) await act(async () => root!.unmount())
  document.body.replaceChildren()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})
it('reveals independent account sections without waiting for installations and preserves edits when they arrive', async () => {
  const user = {
    id: 'one',
    name: 'Alice',
    email: 'alice@example.com',
    emailVerified: true,
    image: null,
    githubUsername: null,
  }
  let finish!: (value: unknown) => void
  api.settings.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  client.setQueryData(authenticationQueryOptions().queryKey, {
    user,
    isAdmin: false,
    profileCompleted: true,
    methods: { github: true, email: true, google: false },
  })
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () =>
    root!.render(
      <TestI18n>
        {
          <QueryClientProvider client={client}>
            <UserSettings />
          </QueryClientProvider>
        }
      </TestI18n>,
    ),
  )
  expect(document.body.textContent).toContain('Independent preferences')
  expect(document.body.textContent).toContain('Independent hosted sections')
  const name = document.querySelector<HTMLInputElement>('input')!
  name.value = 'Unsaved name'
  expect(
    document.querySelector<HTMLButtonElement>(
      '[aria-label="GitHub connection actions"]',
    )!.disabled,
  ).toBe(true)
  expect(finish).toBeTypeOf('function')
  await act(async () =>
    finish({
      user,
      preferences: {},
      githubConnected: false,
      githubAccountId: null,
      githubAvailable: true,
      githubAppInstallAvailable: false,
      isAdmin: false,
      githubManageUrl: null,
      accounts: [],
    }),
  )
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10))
  })
  expect(
    [...document.querySelectorAll('button')].some(
      (button) => button.textContent === 'Connect',
    ),
  ).toBe(true)
  expect(document.querySelector<HTMLInputElement>('input')!.value).toBe(
    'Unsaved name',
  )
  expect(
    document.querySelector('[aria-label="Loading sign-in methods"]'),
  ).toBeNull()
  client.clear()
})
