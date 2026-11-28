// @vitest-environment jsdom
import { TestI18n } from '#/i18n/test-provider'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { SettingsLayout } from './settings-layout'

vi.mock('#/features/dashboard/about-dialog', () => ({
  AboutDialog: () => <button>About</button>,
}))
vi.mock('#/features/account/account-menu', () => ({
  AccountMenu: ({ align, side }: { align: string; side: string }) => (
    <button data-align={align} data-side={side}>
      Account menu
    </button>
  ),
}))
let root: Root
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  HTMLElement.prototype.scrollIntoView = vi.fn()
  window.scrollTo = vi.fn()
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  )
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    })),
  )
  const host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  document.body.replaceChildren()
  vi.unstubAllGlobals()
})

async function setup(area: 'Account' | 'Admin') {
  const prefix = area === 'Account' ? 'settings' : 'admin'
  const items = [
    { id: 'first', label: 'First' },
    { id: 'second', label: 'Second', destructive: true },
  ]
  const rootRoute = createRootRoute()
  const route = createRoute({
    getParentRoute: () => rootRoute,
    path: prefix,
    component: () => {
      return (
        <SettingsLayout
          area={area}
          items={items}
          user={{
            id: 'user',
            name: 'User',
            email: 'user@example.com',
            image: null,
            githubUsername: null,
          }}
        >
          <section id="first">first content</section>
          <section id="second">second content</section>
        </SettingsLayout>
      )
    },
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([route]),
    history: createMemoryHistory({ initialEntries: [`/${prefix}#first`] }),
  })
  await act(async () => {
    await router.load()
    root.render(
      <TestI18n>
        <RouterProvider router={router} />
      </TestI18n>,
    )
  })
  return router
}

it.each(['Account', 'Admin'] as const)(
  '%s anchor-links within one page and keeps Back in the sidebar',
  async (area) => {
    const router = await setup(area)
    const sidebar = document.querySelector('[data-slot="sidebar"]')!
    const heading = document.querySelector('h1')!
    expect(
      heading.parentElement?.querySelector('[data-slot="sidebar-trigger"]'),
    ).toBeTruthy()
    expect(sidebar.querySelector('nav [data-active="true"]')).toBeNull()
    for (const link of sidebar.querySelectorAll('nav a'))
      expect(link.querySelector('svg[aria-hidden="true"]')).toBeTruthy()
    expect(sidebar.querySelector('a')?.getAttribute('href')).toBe('/')
    expect(sidebar.querySelector('a')?.className).toContain(
      'text-muted-foreground',
    )
    expect(sidebar.querySelector('a svg')).toBeTruthy()
    expect(
      sidebar
        .querySelector('[data-slot="sidebar-header"]')
        ?.nextElementSibling?.getAttribute('data-slot'),
    ).toBe('sidebar-separator')
    const footer = sidebar.querySelector('[data-slot="sidebar-footer"]')!
    expect(footer.textContent).toContain('Account menu')
    expect(footer.textContent).toContain('About')
    expect(
      footer.querySelector('[data-align="start"][data-side="top"]'),
    ).toBeTruthy()

    expect(sidebar.querySelector('[aria-current="page"]')?.textContent).toBe(
      'First',
    )
    const second = [...sidebar.querySelectorAll('a')].find(
      (link) => link.textContent === 'Second',
    )!
    expect(second.className).toContain('text-destructive')
    await act(async () => {
      second.click()
    })
    expect(router.state.location.pathname).toBe(
      `/${area === 'Account' ? 'settings' : 'admin'}`,
    )
    expect(sidebar.querySelector('[aria-current="page"]')?.textContent).toBe(
      'Second',
    )
    expect(router.state.location.hash).toBe('second')
    expect(sidebar.querySelector('nav [data-active="true"]')).toBeNull()
    expect(document.getElementById('first')).toBeTruthy()
    expect(document.getElementById('second')).toBeTruthy()
    expect(document.querySelector('main')?.textContent).toContain(
      'second content',
    )
    expect(document.querySelector('main')?.textContent).not.toContain(
      'Back to projects',
    )
  },
)

it('closes the mobile menu after choosing a section', async () => {
  vi.stubGlobal('innerWidth', 390)
  await setup('Account')
  await vi.waitFor(async () => {
    await act(async () => {
      expect(
        document.querySelector<HTMLButtonElement>(
          '[aria-label="Open account navigation"]',
        )?.disabled,
      ).toBe(false)
    })
  })
  await act(async () => {
    document
      .querySelector<HTMLButtonElement>(
        '[aria-label="Open account navigation"]',
      )!
      .click()
  })
  const dialog = document.querySelector('[role="dialog"]')!
  expect(dialog.querySelector('a')?.textContent).toBe('Back')
  const second = [...dialog.querySelectorAll('a')].find(
    (link) => link.textContent === 'Second',
  )!
  await act(async () => {
    second.click()
  })
  expect(document.querySelector('[role="dialog"]')).toBeNull()
  expect(document.querySelector('main')?.textContent).toContain(
    'second content',
  )
})
