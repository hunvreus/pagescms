import { TestI18n } from '#/i18n/test-provider'
// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import FolderIcon from '@hugeicons/core-free-icons/Folder01Icon'
import NewsIcon from '@hugeicons/core-free-icons/News01Icon'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ContentIcon } from './content-icon'

let container: HTMLDivElement
let root: ReturnType<typeof createRoot>

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      url.endsWith('/News01Icon.json')
        ? new Response(JSON.stringify(NewsIcon), {
            headers: { 'content-type': 'application/json' },
          })
        : new Response(null, { status: 404 }),
    ),
  )
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

async function render(name?: string) {
  await act(async () => {
    root.render(
      <TestI18n>
        {
          <ContentIcon
            name={name}
            fallback={FolderIcon}
            data-icon="inline-start"
          />
        }
      </TestI18n>,
    )
  })
}

describe('configured content icons', () => {
  it('loads Hugeicons names and uses the same native stroke as the fallback', async () => {
    await render('News01')
    await vi.waitFor(
      async () => {
        await act(async () => {})
        expect(container.querySelector('svg')?.innerHTML).toContain(
          String(NewsIcon[0][1].d),
        )
      },
      { timeout: 10000 },
    )
    expect(container.querySelector('svg')?.getAttribute('data-icon')).toBe(
      'inline-start',
    )
    await render()
    expect(container.querySelector('svg')?.getAttribute('data-icon')).toBe(
      'inline-start',
    )
    expect(container.querySelector('svg')?.innerHTML).toContain(
      String(FolderIcon[0][1].d),
    )
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('keeps the default when a loaded icon has no drawable elements', async () => {
    const loader = await import('#/lib/content-icon-loader')
    const load = vi.spyOn(loader, 'loadContentIcon').mockResolvedValueOnce([])
    try {
      await render('EmptyIcon')
      await vi.waitFor(() => expect(load).toHaveBeenCalledWith('EmptyIcon'))
      await act(async () => {})
      expect(container.querySelector('svg')?.innerHTML).toContain(
        String(FolderIcon[0][1].d),
      )
    } finally {
      load.mockRestore()
    }
  })

  it('uses the fallback for unknown names and never reuses a stale icon', async () => {
    await render('News01')
    await vi.waitFor(
      async () => {
        await act(async () => {})
        expect(container.querySelector('svg')?.innerHTML).toContain(
          String(NewsIcon[0][1].d),
        )
      },
      { timeout: 10000 },
    )
    await render('not-a-real-icon')
    expect(container.querySelector('svg')?.innerHTML).toContain(
      String(FolderIcon[0][1].d),
    )
    expect(container.querySelector('svg')).not.toBeNull()
  })
})
