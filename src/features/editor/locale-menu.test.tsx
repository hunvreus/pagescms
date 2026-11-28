import { TestI18n } from '#/i18n/test-provider'
// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { FileLocaleMenu } from './file-locale-menu'
import { LocaleMenu } from './locale-context'
import { StartTranslationDialog } from './start-translation-dialog'
import { FieldLocaleMenu } from './field-locale-menu'
import { stageTranslation, translationStartKey } from './translation-start'
import { authenticationQueryOptions } from '#/client/queries/session'
import type { Root } from 'react-dom/client'
import type { JsonValue } from '#/shared/json'

const calls = vi.hoisted(() => ({
  translations: vi.fn(),
  navigate: vi.fn(),
  raw: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  preferences: vi.fn(),
  savePreferences: vi.fn(),
}))
vi.mock('#/client/api/entries', () => ({
  readTranslations: (data: unknown) => calls.translations({ data }),
  readEntry: (data: unknown) => calls.raw({ data }),
}))
vi.mock('#/client/api/account', () => ({
  getAccountPreferences: calls.preferences,
  saveAccountPreferences: calls.savePreferences,
}))
vi.mock('sonner', () => ({ toast: { error: calls.error, info: calls.info } }))
vi.mock('@tanstack/react-router', () => ({
  useRouter: () => ({ navigate: calls.navigate }),
  Link: ({ children, ...props }: { children: React.ReactNode }) => (
    <a {...props}>{children}</a>
  ),
}))
let root: Root
let client: QueryClient
const locales = [
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
  { code: 'ar', label: 'العربية' },
]
const coordinates = {
  owner: 'pagescms',
  repo: 'Test',
  branch: 'main',
  name: 'posts',
  path: 'posts/hello.md',
}
const available = [
  { ...locales[0], path: coordinates.path, exists: true, sha: 'en-sha' },
  { ...locales[1], path: 'posts/hello.fr.md', exists: true, sha: 'fr-sha' },
  { ...locales[2], path: 'posts/hello.ar.md', exists: false, sha: null },
]
const copied = vi.fn()
const selected = vi.fn()
beforeEach(() => {
  vi.clearAllMocks()
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
  localStorage.clear()
  calls.preferences.mockResolvedValue({})
  calls.savePreferences.mockImplementation(async (data) => ({
    editing: data.editing,
  }))
  calls.navigate.mockResolvedValue(undefined)
  calls.translations.mockResolvedValue(available)
  calls.raw.mockResolvedValue({
    mode: 'raw',
    sha: 'fr-sha',
    source: 'Bonjour',
    path: 'posts/hello.fr.md',
  })
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(['account-preferences', 'alice'], {})
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
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  client.clear()
  document.body.replaceChildren()
  vi.unstubAllGlobals()
})
function renderWithClient(node: React.ReactNode) {
  root.render(
    <TestI18n>
      {<QueryClientProvider client={client}>{node}</QueryClientProvider>}
    </TestI18n>,
  )
}
async function renderFile(
  props: Partial<React.ComponentProps<typeof FileLocaleMenu>> = {},
) {
  await act(async () =>
    renderWithClient(
      <QueryClientProvider client={client}>
        <FileLocaleMenu
          coordinates={coordinates}
          config={{ default: 'en', locales, scheme: 'files' }}
          locale="en"
          schemaType="collection"
          onCopy={copied}
          draftReady
          {...props}
        />
      </QueryClientProvider>,
    ),
  )
}
function button(text: string) {
  const found = [
    ...document.querySelectorAll<HTMLButtonElement>('button'),
  ].find((el) => el.textContent === text)
  expect(found, `Button ${text}`).toBeTruthy()
  return found!
}
async function open() {
  await act(async () =>
    button('English').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
    ),
  )
}
async function chooseFrench() {
  const sub = document.querySelector<HTMLElement>(
    '[data-slot="dropdown-menu-sub-trigger"]',
  )!
  expect(sub.textContent).toContain('Copy from…')
  await act(async () =>
    sub.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
    ),
  )
  const item = [
    ...document.querySelectorAll<HTMLElement>(
      '[data-slot="dropdown-menu-sub-content"] [role="menuitem"]',
    ),
  ].find((el) => el.textContent === 'Français')!
  expect(item).toBeTruthy()
  await act(async () => item.click())
}

it('loads availability before the menu opens, groups languages, and reuses the result', async () => {
  await renderFile()
  expect(calls.translations).toHaveBeenCalledOnce()
  expect(document.querySelector('[role="menu"]')).toBeNull()
  expect(
    button('English').querySelector('[data-icon="inline-end"]'),
  ).toBeTruthy()
  expect(button('English').getAttribute('data-size')).toBe('default')
  await open()
  expect(
    document
      .querySelector('[aria-current="true"]')
      ?.getAttribute('aria-disabled'),
  ).toBe('true')
  expect(document.body.textContent).toContain('Existing translations')
  expect(document.body.textContent).toContain('Missing translations')
  expect(document.body.textContent).not.toContain('Checking translations…')
  expect(
    document.querySelector('[data-slot="dropdown-menu-content"]')?.className,
  ).toContain('w-max')
  await chooseFrench()
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
    'including unsaved changes',
  )
  expect(calls.raw).not.toHaveBeenCalled()
  await act(async () => button('Cancel').click())
  await open()
  expect(calls.translations).toHaveBeenCalledOnce()
  expect(copied).not.toHaveBeenCalled()
})

it('copies saved content only after confirmation, including for an existing translation', async () => {
  await renderFile()
  await open()
  await chooseFrench()
  expect(copied).not.toHaveBeenCalled()
  await act(async () => button('Copy content').click())
  expect(calls.raw).toHaveBeenCalledExactlyOnceWith({
    data: { ...coordinates, path: 'posts/hello.fr.md' },
  })
  expect(copied).toHaveBeenCalledExactlyOnceWith('Bonjour')
  expect(calls.error).not.toHaveBeenCalled()
})

it('keeps the destination untouched and reports once if a copy source disappears', async () => {
  calls.raw.mockResolvedValue({
    mode: 'raw',
    sha: null,
    source: '',
    path: 'posts/hello.fr.md',
  })
  await renderFile()
  await open()
  await chooseFrench()
  await act(async () => button('Copy content').click())
  expect(copied).not.toHaveBeenCalled()
  expect(calls.error).toHaveBeenCalledOnce()
  expect(document.querySelector('[role="dialog"]')).toBeTruthy()
})

it('uses the same chevron and Copy from submenu for single-file locales, with confirmed missing-only copying', async () => {
  const onCopy = vi.fn()
  await act(async () =>
    renderWithClient(
      <LocaleMenu
        locale="en"
        locales={locales}
        onSelect={() => {}}
        onCopy={onCopy}
      />,
    ),
  )
  await open()
  await chooseFrench()
  expect(onCopy).not.toHaveBeenCalled()
  await act(async () => button('Copy content').click())
  expect(onCopy).toHaveBeenCalledExactlyOnceWith('fr', false)
})

it('does not offer empty languages as single-file copy sources', async () => {
  await act(async () =>
    renderWithClient(
      <LocaleMenu
        locale="en"
        locales={locales}
        onSelect={() => {}}
        onCopy={() => {}}
        copySources={['en']}
      />,
    ),
  )
  await open()
  expect(
    document.querySelector('[data-slot="dropdown-menu-sub-trigger"]'),
  ).toBeNull()
})

async function renderField(value: Record<string, JsonValue>) {
  await act(async () =>
    renderWithClient(
      <FieldLocaleMenu
        locale="en"
        locales={locales}
        value={value}
        label="Summary"
        onCopy={(code) =>
          copied({ ...value, en: structuredClone(value[code]) })
        }
        onSelect={selected}
      />,
    ),
  )
}
async function openField() {
  const trigger = document.querySelector(
    '[aria-label="Summary: English language"]',
  )!
  await act(async () =>
    trigger.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
    ),
  )
  const copy = [
    ...document.querySelectorAll<HTMLElement>(
      '[data-slot="dropdown-menu-sub-trigger"]',
    ),
  ].find((item) => item.textContent === 'Copy from…')!
  await act(async () =>
    copy.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
    ),
  )
  const french = [
    ...document.querySelectorAll<HTMLElement>(
      '[data-slot="dropdown-menu-sub-content"] [role="menuitem"]',
    ),
  ].find((item) => item.textContent === 'Français')!
  await act(async () => french.click())
}
it('keeps a language badge and disables copying when no other language has a value', async () => {
  await renderField({ en: 'Only English' })
  const badge = document.querySelector(
    '[aria-label="Summary: English language"]',
  )!
  expect(badge.textContent).toBe('English')
  expect(badge.querySelectorAll('svg')).toHaveLength(2)
  await act(async () =>
    badge.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
    ),
  )
  expect(
    document.querySelector('[role="menuitem"][aria-disabled="true"]')
      ?.textContent,
  ).toBe('Copy from…')
  expect(document.body.textContent).toContain('Switch language')
})
it('confirms replacing an existing field and preserves it when cancelled', async () => {
  await renderField({ en: 'Draft text', fr: '' })
  await openField()
  expect(copied).not.toHaveBeenCalled()
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
    'unsaved changes',
  )
  await act(async () => button('Cancel').click())
  expect(copied).not.toHaveBeenCalled()
  await openField()
  await act(async () => button('Replace translation').click())
  expect(copied).toHaveBeenCalledExactlyOnceWith({ en: '', fr: '' })
})
it.each([false, 0, null, '', []])(
  'copies intentional source value %j into a missing field',
  async (value) => {
    await renderField({ fr: value })
    await openField()
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(copied).toHaveBeenCalledExactlyOnceWith({ en: value, fr: value })
  },
)

it('starts a missing file from the visible draft without a repository write', async () => {
  const value = { title: 'Unsaved English' }
  const flush = vi.fn().mockResolvedValue(undefined)
  await renderFile({
    currentValue: value,
    draftReady: true,
    saved: true,
    flush,
  })
  await open()
  const missing = [
    ...document.querySelectorAll<HTMLElement>('[role="menuitem"]'),
  ].find((item) => item.textContent.includes('العربية'))!
  await act(async () => missing.click())
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
    'Start العربية translation',
  )
  expect(calls.navigate).not.toHaveBeenCalled()
  await act(async () =>
    document.querySelector<HTMLElement>('[role="checkbox"]')!.click(),
  )
  await act(async () => button('Start translation').click())
  expect(flush).toHaveBeenCalledOnce()
  expect(calls.raw).not.toHaveBeenCalled()
  expect(calls.navigate).toHaveBeenCalledOnce()
  expect(
    localStorage.getItem(
      'pagescms:translation-preference:["alice","copy-on-start"]',
    ),
  ).toBe('true')
  await renderFile({
    coordinates: { ...coordinates, path: 'posts/hello.ar.md' },
    locale: 'ar',
    draftReady: true,
  })
  expect(copied).toHaveBeenCalledExactlyOnceWith(value)
})
it('cancels translation initialization without navigation or draft changes', async () => {
  await renderFile({ currentValue: 'Unsaved', draftReady: true })
  await open()
  await act(async () =>
    [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')]
      .find((item) => item.textContent.includes('العربية'))!
      .click(),
  )
  await act(async () => button('Cancel').click())
  expect(calls.navigate).not.toHaveBeenCalled()
  expect(copied).not.toHaveBeenCalled()
})
it('prompts for missing single-file languages and copies only after Start', async () => {
  const start = vi.fn()
  const select = vi.fn()
  await act(async () =>
    renderWithClient(
      <LocaleMenu
        locale="en"
        locales={locales}
        copySources={['en', 'fr']}
        account="alice"
        onSelect={select}
        onStart={start}
      />,
    ),
  )
  await open()
  await act(async () =>
    [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')]
      .find((item) => item.textContent.includes('العربية'))!
      .click(),
  )
  expect(start).not.toHaveBeenCalled()
  await act(async () =>
    document.querySelector<HTMLElement>('[role="checkbox"]')!.click(),
  )
  await act(async () => button('Start translation').click())
  expect(start).toHaveBeenCalledExactlyOnceWith('ar', true)
  expect(select).toHaveBeenCalledExactlyOnceWith('ar')
})

it.each([
  ['saved', true, false],
  ['draft', false, true],
] as const)(
  'preserves an existing destination %s when a translation starts',
  async (_kind, saved, draftDirty) => {
    stageTranslation(client, translationStartKey('alice', coordinates), {
      title: 'Copied source',
    })
    await renderFile({ draftReady: true, saved, draftDirty })
    expect(copied).not.toHaveBeenCalled()
    expect(calls.info).toHaveBeenCalledOnce()
    expect(
      client.getQueryData(translationStartKey('alice', coordinates)),
    ).toBeUndefined()
  },
)
it('does not apply another account’s staged translation', async () => {
  stageTranslation(
    client,
    translationStartKey('bob', coordinates),
    'Private Bob draft',
  )
  await renderFile({ draftReady: true })
  expect(copied).not.toHaveBeenCalled()
})
it('starts a blank translation without staging source content', async () => {
  await renderFile({ currentValue: 'Source content', draftReady: true })
  await open()
  await act(async () =>
    [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')]
      .find((item) => item.textContent.includes('العربية'))!
      .click(),
  )
  await act(async () => button('Start translation').click())
  expect(calls.navigate).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ search: { locale: 'ar' } }),
  )
  expect(calls.raw).not.toHaveBeenCalled()
  expect(
    client.getQueryData(
      translationStartKey('alice', {
        ...coordinates,
        path: 'posts/hello.ar.md',
      }),
    ),
  ).toBeUndefined()
  expect(copied).not.toHaveBeenCalled()
})

it('clears staged source data and reports once when starting navigation fails', async () => {
  calls.navigate.mockRejectedValueOnce(new Error('Navigation failed'))
  await renderFile({ currentValue: 'Unsaved source', draftReady: true })
  await open()
  await act(async () =>
    [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')]
      .find((item) => item.textContent.includes('العربية'))!
      .click(),
  )
  await act(async () =>
    document.querySelector<HTMLElement>('[role="checkbox"]')!.click(),
  )
  await act(async () => button('Start translation').click())
  expect(
    client.getQueryData(
      translationStartKey('alice', {
        ...coordinates,
        path: 'posts/hello.ar.md',
      }),
    ),
  ).toBeUndefined()
  expect(calls.error).toHaveBeenCalledOnce()
  expect(copied).not.toHaveBeenCalled()
  expect(document.querySelector('[role="dialog"]')).toBeTruthy()
})

it('preserves a remembered copy preference when the current source cannot be copied', async () => {
  localStorage.setItem(
    'pagescms:translation-preference:["alice","copy-on-start"]',
    'true',
  )
  const start = vi.fn()
  await act(async () =>
    renderWithClient(
      <StartTranslationDialog
        open
        onOpenChange={() => {}}
        language="French"
        source="English"
        account="alice"
        canCopy={false}
        onStart={start}
      />,
    ),
  )
  expect(
    document.querySelector('[role="checkbox"]')?.getAttribute('data-state'),
  ).toBe('unchecked')
  await act(async () => button('Start translation').click())
  expect(start).toHaveBeenCalledExactlyOnceWith(false)
  expect(
    localStorage.getItem(
      'pagescms:translation-preference:["alice","copy-on-start"]',
    ),
  ).toBe('true')
})

it('switches the whole editor from a field badge without changing field values', async () => {
  await renderField({ en: 'Hello', fr: 'Bonjour' })
  const badge = document.querySelector(
    '[aria-label="Summary: English language"]',
  )!
  await act(async () =>
    badge.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
    ),
  )
  const change = [
    ...document.querySelectorAll<HTMLElement>(
      '[data-slot="dropdown-menu-sub-trigger"]',
    ),
  ].find((item) => item.textContent === 'Switch language')!
  await act(async () =>
    change.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
    ),
  )
  const current = [
    ...document.querySelectorAll<HTMLElement>(
      '[data-slot="dropdown-menu-sub-content"] [role="menuitem"]',
    ),
  ].find((item) => item.textContent === 'English')!
  expect(current.getAttribute('aria-disabled')).toBe('true')
  const french = [
    ...document.querySelectorAll<HTMLElement>(
      '[data-slot="dropdown-menu-sub-content"] [role="menuitem"]',
    ),
  ].find((item) => item.textContent === 'Français')!
  await act(async () => french.click())
  expect(selected).toHaveBeenCalledExactlyOnceWith('fr')
  expect(copied).not.toHaveBeenCalled()
})

it.each(['blank', 'copy'])(
  'starts missing file with the %s account preference without prompting',
  async (mode) => {
    client.setQueryData(['account-preferences', 'alice'], {
      editing: { newTranslations: mode },
    })
    const value = { title: 'Unsaved English' }
    const flush = vi.fn().mockResolvedValue(undefined)
    await renderFile({
      currentValue: value,
      draftReady: true,
      saved: true,
      flush,
    })
    await open()
    await act(async () =>
      [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')]
        .find((item) => item.textContent.includes('العربية'))!
        .click(),
    )
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(flush).toHaveBeenCalledOnce()
    expect(calls.navigate).toHaveBeenCalledOnce()
    expect(calls.raw).not.toHaveBeenCalled()
    expect(
      client.getQueryData(
        translationStartKey('alice', {
          ...coordinates,
          path: 'posts/hello.ar.md',
        }),
      ),
    ).toEqual(mode === 'copy' ? value : undefined)
  },
)
it.each(['blank', 'copy'])(
  'starts missing single-file language with the %s preference without prompting',
  async (mode) => {
    client.setQueryData(['account-preferences', 'alice'], {
      editing: { newTranslations: mode },
    })
    const start = vi.fn()
    const select = vi.fn()
    await act(async () =>
      renderWithClient(
        <LocaleMenu
          locale="en"
          locales={locales}
          copySources={['en', 'fr']}
          account="alice"
          onSelect={select}
          onStart={start}
        />,
      ),
    )
    await open()
    await act(async () =>
      [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')]
        .find((item) => item.textContent.includes('العربية'))!
        .click(),
    )
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(start).toHaveBeenCalledExactlyOnceWith('ar', mode === 'copy')
    expect(select).toHaveBeenCalledExactlyOnceWith('ar')
  },
)
it('remembers an explicit skip-prompt choice only after starting', async () => {
  await act(async () =>
    renderWithClient(
      <StartTranslationDialog
        open
        onOpenChange={vi.fn()}
        language="Français"
        source="English"
        account="alice"
        canCopy
        onStart={vi.fn()}
      />,
    ),
  )
  const checks = document.querySelectorAll<HTMLElement>('[role="checkbox"]')
  await act(async () => {
    checks[0].click()
    checks[1].click()
  })
  expect(
    client.getQueryData<{ editing?: { newTranslations?: string } }>([
      'account-preferences',
      'alice',
    ])?.editing?.newTranslations,
  ).toBeUndefined()
  await act(async () => button('Start translation').click())
  expect(
    client.getQueryData<{ editing?: { newTranslations?: string } }>([
      'account-preferences',
      'alice',
    ])?.editing?.newTranslations,
  ).toBe('copy')
})

it.each(['ask', 'blank'])(
  'supports keyboard activation of a missing translation with %s preference',
  async (mode) => {
    client.setQueryData(['account-preferences', 'alice'], {
      editing: { newTranslations: mode },
    })
    await renderFile({ currentValue: 'Source', draftReady: true })
    await open()
    const missing = [
      ...document.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    ].find((item) => item.textContent.includes('العربية'))!
    await act(async () => {
      missing.focus()
      missing.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
      )
    })
    if (mode === 'ask') {
      expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
        'Start العربية translation',
      )
      expect(calls.navigate).not.toHaveBeenCalled()
    } else {
      expect(document.querySelector('[role="dialog"]')).toBeNull()
      expect(calls.navigate).toHaveBeenCalledOnce()
    }
  },
)

it('still starts a translation when saving the remembered mode fails', async () => {
  const start = vi.fn()
  calls.savePreferences.mockRejectedValueOnce(new Error('Unavailable'))
  await act(async () =>
    renderWithClient(
      <StartTranslationDialog
        open
        onOpenChange={vi.fn()}
        language="French"
        source="English"
        account="alice"
        canCopy
        onStart={start}
      />,
    ),
  )
  const checks = document.querySelectorAll<HTMLElement>('[role="checkbox"]')
  await act(async () => {
    checks[0].click()
    checks[1].click()
  })
  await act(async () => button('Start translation').click())
  expect(start).toHaveBeenCalledExactlyOnceWith(true)
  expect(calls.error).toHaveBeenCalledOnce()
})

it('keeps existing translations available when the role cannot create another', async () => {
  await renderFile({ allowCreate: false, onCopy: undefined })
  await open()
  const items = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')]
  expect(
    items.find((item) => item.textContent.includes('Français')),
  ).toBeTruthy()
  const missing = items.find((item) => item.textContent.includes('العربية'))
  expect(missing?.hasAttribute('data-disabled')).toBe(true)
  expect(
    document.querySelector('[data-slot="dropdown-menu-sub-trigger"]'),
  ).toBeNull()
})
