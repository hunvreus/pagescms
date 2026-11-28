// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { setupI18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { LanguagePreference } from './language-preference'
import { authenticationQueryOptions } from '#/client/queries/session'
import { messages } from '#/locales/en/messages.po'
import { toast } from '#/lib/notifications'

const api = vi.hoisted(() => ({ save: vi.fn(), french: vi.fn() }))
vi.mock('#/client/api/account', () => ({ saveLanguage: api.save }))
vi.mock('#pagescms/deployment/client', () => ({
  default: {
    plugins: [
      {
        id: 'example',
        translations: {
          en: async () => ({ messages: { 'example.greeting': ['Hello'] } }),
          fr: api.french,
        },
      },
    ],
  },
}))
let root: ReturnType<typeof createRoot>
let client: QueryClient
let i18n: ReturnType<typeof setupI18n>
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  HTMLElement.prototype.scrollIntoView = vi.fn()
  api.french.mockResolvedValue({
    messages: { 'example.greeting': ['Bonjour'] },
  })
  i18n = setupI18n({ locale: 'en', messages: { en: messages } })
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(authenticationQueryOptions().queryKey, {
    profileCompleted: true,
    isAdmin: false,
    methods: { github: true, google: false, email: false },
    user: {
      id: 'alice',
      name: 'Alice',
      email: 'alice@example.com',
      image: null,
      githubUsername: null,
    },
  })
  const host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <I18nProvider i18n={i18n}>
          <input aria-label="Draft" defaultValue="unsaved" />
          <LanguagePreference accountId="alice" />
        </I18nProvider>
      </QueryClientProvider>,
    ),
  )
})
afterEach(async () => {
  await act(async () => root.unmount())
  client.clear()
  document.body.replaceChildren()
  vi.restoreAllMocks()
  vi.resetAllMocks()
  vi.unstubAllGlobals()
})
async function chooseFrench(persist = true) {
  await act(async () =>
    document.querySelector<HTMLButtonElement>('#interface-language')!.click(),
  )
  const option = [
    ...document.querySelectorAll<HTMLElement>('[role="option"]'),
  ].find((node) => node.textContent === 'Français')!
  await act(async () => option.click())
  if (persist)
    await act(async () => {
      // The first switch compiles lazy catalogs; wait for it before tearing down this account.
      await vi.waitFor(() => expect(api.save).toHaveBeenCalledOnce(), {
        timeout: 5000,
      })
    })
}
it('saves and switches in place while retaining sibling input and the query cache', async () => {
  api.save.mockResolvedValue({
    language: 'fr',
    editing: { newTranslations: 'copy' },
  })
  const input = document.querySelector<HTMLInputElement>(
    'input[aria-label="Draft"]',
  )!
  input.value = 'changed draft'
  client.setQueryData(['repository-fixture'], { unchanged: true })
  await chooseFrench()
  await vi.waitFor(() => expect(i18n.locale).toBe('fr'))
  expect(api.save).toHaveBeenCalledWith({ accountId: 'alice', language: 'fr' })
  expect(document.querySelector('input[aria-label="Draft"]')).toBe(input)
  expect(input.value).toBe('changed draft')
  expect(client.getQueryData(['repository-fixture'])).toEqual({
    unchanged: true,
  })
  expect(client.getQueryState(['repository-fixture'])?.isInvalidated).toBe(
    false,
  )
})
it('keeps the old language and reports persistence failure once', async () => {
  api.save.mockRejectedValue(new Error('Unavailable'))
  const error = vi.spyOn(toast, 'error')
  await chooseFrench()
  await vi.waitFor(() => expect(error).toHaveBeenCalledOnce())
  expect(i18n.locale).toBe('en')
})
it('does not apply a late response to another signed-in account', async () => {
  let finish!: (value: unknown) => void
  api.save.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  await chooseFrench()
  await act(async () => {
    client.setQueryData(authenticationQueryOptions().queryKey, {
      profileCompleted: true,
      isAdmin: false,
      methods: { github: true, google: false, email: false },
      user: {
        id: 'bob',
        name: 'Bob',
        email: 'bob@example.com',
        image: null,
        githubUsername: null,
      },
    })
    finish({ language: 'fr' })
  })
  expect(i18n.locale).toBe('en')
  expect(client.getQueryData(['account-preferences', 'alice'])).toBeUndefined()
})

it('preserves concurrent editing preference changes when language persistence finishes', async () => {
  let finish!: (value: unknown) => void
  api.save.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  await chooseFrench()
  client.setQueryData(['account-preferences', 'alice'], {
    editing: { newTranslations: 'copy' },
  })
  await act(async () =>
    finish({ language: 'fr', editing: { newTranslations: 'blank' } }),
  )
  expect(client.getQueryData(['account-preferences', 'alice'])).toEqual({
    language: 'fr',
    editing: { newTranslations: 'copy' },
  })
})

it('keeps language and preference unchanged when a plugin catalog fails to load', async () => {
  const error = vi.spyOn(toast, 'error')
  const cookie = document.cookie
  api.french.mockRejectedValue(new Error('Catalog unavailable'))
  await chooseFrench(false)
  await vi.waitFor(() => expect(error).toHaveBeenCalledOnce())
  expect(api.save).not.toHaveBeenCalled()
  expect(i18n.locale).toBe('en')
  expect(document.cookie).toBe(cookie)
})

it('applies an acknowledged account language after navigating away during the save', async () => {
  let finish!: (value: unknown) => void
  api.save.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  await chooseFrench()
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <I18nProvider i18n={i18n}>
          <p>Another page</p>
        </I18nProvider>
      </QueryClientProvider>,
    ),
  )
  await act(async () => finish({ language: 'fr' }))
  await vi.waitFor(() => expect(i18n.locale).toBe('fr'))
  expect(document.cookie).toContain('pagescms-language=fr')
})
