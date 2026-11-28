// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { setupI18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, expect, it, vi } from 'vitest'
import { AccountMenu } from './account-menu'
import { messages } from '#/locales/en/messages.po'
import { toast } from '#/lib/notifications'

vi.mock('#/components/ui/dropdown-menu', () => {
  const Container = ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  )
  return {
    DropdownMenu: Container,
    DropdownMenuTrigger: Container,
    DropdownMenuContent: Container,
    DropdownMenuLabel: Container,
    DropdownMenuSeparator: () => null,
    DropdownMenuSub: Container,
    DropdownMenuSubContent: Container,
    DropdownMenuSubTrigger: Container,
    DropdownMenuRadioGroup: Container,
    DropdownMenuRadioItem: Container,
    DropdownMenuItem: ({
      children,
      onSelect,
      disabled,
    }: {
      children: React.ReactNode
      onSelect?: () => void
      disabled?: boolean
    }) =>
      onSelect ? (
        <button disabled={disabled} onClick={onSelect}>
          {children}
        </button>
      ) : (
        <div>{children}</div>
      ),
  }
})
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it.each(['http', 'network'])(
  'keeps the session cache and allows retry after a %s sign-out failure',
  async (failure) => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    const fetchMock = vi.fn()
    if (failure === 'http') fetchMock.mockResolvedValue({ ok: false })
    else fetchMock.mockRejectedValue(new Error('Network unavailable'))
    vi.stubGlobal('fetch', fetchMock)
    const notification = vi
      .spyOn(toast, 'error')
      .mockImplementation(() => 'toast')
    const client = new QueryClient()
    client.setQueryData(['fixture'], 'still here')
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const i18n = setupI18n({ locale: 'en', messages: { en: messages } })
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <I18nProvider i18n={i18n}>
            <AccountMenu
              isAdmin={false}
              user={{
                id: 'alice',
                name: 'Alice',
                email: 'alice@example.com',
                image: null,
                githubUsername: null,
              }}
            />
          </I18nProvider>
        </QueryClientProvider>,
      ),
    )
    const button = [...host.querySelectorAll('button')].find((item) =>
      item.textContent.includes('Sign out'),
    )!
    await act(async () => button.click())
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(notification).toHaveBeenCalledOnce()
    expect(client.getQueryData(['fixture'])).toBe('still here')
    expect(button.disabled).toBe(false)
    await act(async () => root.unmount())
  },
)
