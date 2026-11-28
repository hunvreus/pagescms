import { TestI18n } from '#/i18n/test-provider'
// @vitest-environment jsdom
import type * as MockedModule from '#/lib/notifications'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CONTENT_CONFLICT } from '#/shared/content-conflict'
import { useDraftMerge } from './use-draft-merge'
import type { ReactNode } from 'react'
import type { DraftSession } from './draft-session'

type Value = { title: string }
type DialogProps = {
  onApply: (value: Value) => Promise<unknown>
  onClose: () => void
  loadError: unknown
}
const state = vi.hoisted(() => ({
  props: undefined as DialogProps | undefined,
}))
vi.mock('./draft-merge-dialog', () => ({
  DraftMergeDialog: (props: DialogProps) => {
    state.props = props
    if (props.loadError) throw new Error('Cannot render review')
    return <p>Review</p>
  },
}))
vi.mock('#/features/pending-writes/account-operation', () => ({
  accountIsActive: () => () => true,
  assertOperationAccount: () => {},
}))
vi.mock('#/components/ui/dialog', () => ({
  Dialog: ({
    children,
    onOpenChange,
  }: {
    children: ReactNode
    onOpenChange: (open: boolean) => void
  }) => (
    <div>
      <button onClick={() => onOpenChange(false)}>Dismiss review</button>
      {children}
    </div>
  ),
  DialogContent: ({ children }: { children: ReactNode }) => children,
  DialogHeader: ({ children }: { children: ReactNode }) => children,
  DialogTitle: ({ children }: { children: ReactNode }) => children,
  DialogDescription: ({ children }: { children: ReactNode }) => children,
}))
vi.mock('#/lib/notifications', async (original) => ({
  ...(await original<typeof MockedModule>()),
  withErrorNotification: (run: () => Promise<unknown>) => run(),
}))
const host = document.createElement('div')
let root: ReturnType<typeof createRoot> | undefined
let merge: ReturnType<typeof useDraftMerge<Value>>
function setup() {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const snapshot = {
    value: { title: 'mine' },
    base: { value: { title: 'base' } },
    baseSha: 'old',
    dirty: true,
  }
  const applyMerge = vi.fn(async (value: Value, remote: Value, sha: string) => {
    snapshot.value = value
    snapshot.base = { value: remote }
    snapshot.baseSha = sha
  })
  const session = {
    summary: { account: 'editor' },
    getSnapshot: () => snapshot,
    applyMerge,
  } as unknown as DraftSession<Value>
  function Harness() {
    merge = useDraftMerge(session, 'Post')
    return merge.dialog
  }
  root = createRoot(host)
  return { Harness, applyMerge }
}
afterEach(async () => {
  if (root) await act(async () => root!.unmount())
  root = undefined
  state.props = undefined
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
describe('draft review lifecycle', () => {
  it('applies the reviewed value and saves before closing', async () => {
    const { Harness, applyMerge } = setup()
    await act(async () =>
      root!.render(
        <TestI18n>
          {
            <QueryClientProvider client={new QueryClient()}>
              <Harness />
            </QueryClientProvider>
          }
        </TestI18n>,
      ),
    )
    const load = vi.fn(async () => ({
      value: { title: 'remote' },
      sha: 'latest',
    }))
    const save = vi.fn(async () => {})
    await act(async () => {
      await merge.handle(new Error(CONTENT_CONFLICT), load, save)
    })
    await act(async () => {
      await state.props!.onApply({ title: 'merged' })
    })
    expect(applyMerge).toHaveBeenCalledWith(
      { title: 'merged' },
      { title: 'remote' },
      'latest',
    )
    expect(save).toHaveBeenCalledOnce()
    expect(merge.error).toBeNull()
    expect(host.textContent).toBe('')
  })
  it('clears a retained refresh error when closing the failed review boundary', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { Harness } = setup()
    await act(async () =>
      root!.render(
        <TestI18n>
          {
            <QueryClientProvider client={new QueryClient()}>
              <Harness />
            </QueryClientProvider>
          }
        </TestI18n>,
      ),
    )
    const load = vi
      .fn()
      .mockResolvedValueOnce({ value: { title: 'remote' }, sha: 'latest' })
      .mockRejectedValueOnce(new Error('Refresh failed'))
    const save = vi.fn(async () => {
      throw new Error(CONTENT_CONFLICT)
    })
    await act(async () => {
      await merge.handle(new Error(CONTENT_CONFLICT), load, save)
    })
    await act(async () => {
      await state.props!.onApply({ title: 'merged' })
    })
    const dismiss = [...host.querySelectorAll('button')].find(
      (button) => button.textContent === 'Dismiss review',
    )!
    expect(dismiss).toBeTruthy()
    await act(async () => dismiss.click())
    expect(merge.error).toBeNull()
    expect(host.textContent).toBe('')
  })
})
