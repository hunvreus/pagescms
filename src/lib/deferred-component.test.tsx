// @vitest-environment jsdom
import { act, Component, Suspense, useEffect } from 'react'
import type { ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { deferredComponent } from './deferred-component'

vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
afterEach(() => vi.restoreAllMocks())

it('commits sibling effects without a Suspense fallback while sharing the deferred import', async () => {
  let resolve!: (module: { default: () => ReactNode }) => void
  const load = vi.fn(
    () =>
      new Promise<{ default: () => ReactNode }>((done) => {
        resolve = done
      }),
  )
  const Optional = deferredComponent(load, () => <span>Optional pending</span>)
  const mounted = vi.fn()
  function Editor() {
    useEffect(mounted, [])
    return <input aria-label="Editor" />
  }
  const host = document.createElement('div')
  const root = createRoot(host)
  try {
    await act(async () =>
      root.render(
        <Suspense fallback={<span>Suspended</span>}>
          <Editor />
          <Optional />
          <Optional />
        </Suspense>,
      ),
    )
    expect(mounted).toHaveBeenCalledOnce()
    expect(host.querySelector('input')).not.toBeNull()
    expect(host.textContent).toBe('Optional pendingOptional pending')
    expect(load).toHaveBeenCalledOnce()
    await act(async () => resolve({ default: () => <span>Loaded</span> }))
    expect(host.textContent).toBe('LoadedLoaded')
    await act(async () => root.render(<Optional key="new-instance" />))
    expect(host.textContent).toBe('Loaded')
    expect(load).toHaveBeenCalledOnce()
  } finally {
    await act(async () => root.unmount())
  }
})

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? <span>Import failed</span> : this.props.children
  }
}

it('preserves error boundary handling and retries a rejected import on remount', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const load = vi
    .fn()
    .mockRejectedValueOnce(new Error('Offline'))
    .mockResolvedValue({ default: () => <span>Loaded</span> })
  const Optional = deferredComponent(load)
  const host = document.createElement('div')
  const root = createRoot(host)
  try {
    await act(async () =>
      root.render(
        <Boundary>
          <Optional />
        </Boundary>,
      ),
    )
    expect(host.textContent).toBe('Import failed')
    await act(async () =>
      root.render(
        <Boundary key="retry">
          <Optional />
        </Boundary>,
      ),
    )
    expect(host.textContent).toBe('Loaded')
    expect(load).toHaveBeenCalledTimes(2)
  } finally {
    await act(async () => root.unmount())
  }
})

it('does not mount a resolved component after its host unmounts', async () => {
  let resolve!: (module: { default: () => ReactNode }) => void
  const Optional = deferredComponent(
    () =>
      new Promise<{ default: () => ReactNode }>((done) => {
        resolve = done
      }),
  )
  const mounted = vi.fn()
  const host = document.createElement('div')
  const root = createRoot(host)
  await act(async () => root.render(<Optional />))
  await act(async () => root.unmount())
  await act(async () =>
    resolve({
      default: () => {
        mounted()
        return null
      },
    }),
  )
  expect(mounted).not.toHaveBeenCalled()
})
