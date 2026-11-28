// @vitest-environment jsdom
import { TestI18n } from '#/i18n/test-provider'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ContentEditingPreferences } from './content-editing-preferences'
import { toast } from '#/lib/notifications'
import { authenticationQueryOptions } from '#/client/queries/session'
import type { Root } from 'react-dom/client'

const api = vi.hoisted(() => ({ read: vi.fn(), save: vi.fn() }))
vi.mock('#/client/api/account', () => ({
  getAccountPreferences: api.read,
  saveAccountPreferences: api.save,
}))
let root: Root
let client: QueryClient
beforeEach(() => {
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
  api.read.mockResolvedValue({})
  api.save.mockImplementation(async (data) => ({ editing: data.editing }))
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(['account-preferences', 'alice'], {})
  client.setQueryData(['account-preferences', 'bob'], {})
  client.setQueryData(authenticationQueryOptions().queryKey, {
    user: {
      id: 'alice',
      name: 'Alice',
      email: 'alice@example.com',
      image: null,
      githubUsername: null,
    },
    profileCompleted: true,
    isAdmin: false,
    methods: { github: true, google: false, email: false },
  })
  const host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  client.clear()
  document.body.replaceChildren()
  vi.restoreAllMocks()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})
async function render(accountId = 'alice') {
  client.setQueryData(authenticationQueryOptions().queryKey, {
    user: {
      id: accountId,
      name: accountId,
      email: accountId + '@example.com',
      image: null,
      githubUsername: null,
    },
    profileCompleted: true,
    isAdmin: false,
    methods: { github: true, google: false, email: false },
  })
  await act(async () =>
    root.render(
      <TestI18n>
        <QueryClientProvider client={client}>
          <ContentEditingPreferences key={accountId} accountId={accountId} />
        </QueryClientProvider>
      </TestI18n>,
    ),
  )
}
async function choose(value: string) {
  await act(async () =>
    document.querySelector<HTMLElement>('#editing-translation')!.click(),
  )
  const option = [
    ...document.querySelectorAll<HTMLElement>('[role="option"]'),
  ].find((item) => item.textContent.includes(value))!
  await act(async () => option.click())
}
it('saves editing choices to the server and isolates account caches', async () => {
  const success = vi.spyOn(toast, 'success')
  await render()
  await choose('Start blank')
  expect(success).toHaveBeenCalledExactlyOnceWith(
    'Content editing preferences saved',
  )
  expect(api.save).toHaveBeenCalledExactlyOnceWith({
    accountId: 'alice',
    editing: { newTranslations: 'blank' },
  })
  await render('bob')
  expect(document.querySelector('#editing-translation')?.textContent).toContain(
    'Ask every time',
  )
  await render('alice')
  expect(document.querySelector('#editing-translation')?.textContent).toContain(
    'Start blank',
  )
})
it('keeps the previous setting and reports one error when persistence fails', async () => {
  const error = vi.spyOn(toast, 'error')
  api.save.mockRejectedValueOnce(new Error('Unavailable'))
  await render()
  await choose('Copy current language')
  expect(document.querySelector('#editing-translation')?.textContent).toContain(
    'Ask every time',
  )
  expect(error).toHaveBeenCalledOnce()
})

it('does not show defaults until preferences are loaded', async () => {
  client.removeQueries({ queryKey: ['account-preferences', 'alice'] })
  let finish!: (value: unknown) => void
  api.read.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  await render()
  const control = document.querySelector<HTMLButtonElement>(
    '#editing-translation',
  )!
  expect(control.disabled).toBe(true)
  expect(control.textContent).toContain('Loading…')
  expect(control.textContent).not.toContain('Ask every time')
  await act(async () => {
    finish({ editing: { newTranslations: 'blank' } })
  })
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10))
  })
  expect(control.disabled).toBe(false)
  expect(control.textContent).toContain('Start blank')
})
