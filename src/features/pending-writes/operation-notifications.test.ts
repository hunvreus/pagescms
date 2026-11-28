import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { TestI18n } from '#/i18n/test-provider'
import type * as MockedModule from '@tanstack/react-query'
import { beforeEach, expect, it, vi } from 'vitest'
import { QueryClient, onlineManager } from '@tanstack/react-query'
import type { MutationObserverOptions } from '@tanstack/react-query'
import { authenticationQueryOptions } from '#/client/queries/session'
import { CONTENT_CONFLICT } from '#/shared/content-conflict'
import { fieldValidationError } from '#/shared/field-validation-error'
import { useContentMutation } from '#/features/content/content-mutations'
import { useMediaMutation } from '#/features/media/media-mutations'
import { useOperation } from './use-operation'
import { OperationAcknowledgementError } from '#/lib/operation-error'

function renderHook<T>(useValue: () => T): T {
  let result: T | undefined
  function Harness() {
    result = useValue()
    return null
  }
  renderToStaticMarkup(
    createElement(TestI18n, { children: createElement(Harness) }),
  )
  return result!
}

const state = vi.hoisted(() => ({
  client: undefined as QueryClient | undefined,
  error: vi.fn(),
  success: vi.fn(),
}))
vi.mock('sonner', () => ({
  toast: { error: state.error, success: state.success },
}))
vi.mock('@tanstack/react-query', async (original) => ({
  ...(await original<typeof MockedModule>()),
  useQueryClient: () => state.client!,
  useMutationState: () => [],
  useMutation: (
    options: MutationObserverOptions<unknown, unknown, unknown>,
  ) => ({
    mutateAsync: (variables: unknown) =>
      state
        .client!.getMutationCache()
        .build(state.client!, options)
        .execute(variables),
  }),
}))
const coordinates = {
  owner: 'owner',
  repo: 'repo',
  branch: 'main',
  name: 'posts',
  path: 'posts/one.json',
}
beforeEach(() => {
  state.client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  })
  state.client.setQueryData(authenticationQueryOptions().queryKey, {
    user: {
      id: 'editor',
      name: 'Editor',
      email: 'editor@example.com',
      image: null,
      githubUsername: null,
    },
    profileCompleted: true,
    isAdmin: false,
    methods: { github: true, google: false, email: false },
  })
  state.error.mockClear()
  state.success.mockClear()
})
it('notifies once for preparation and RPC failures through the actual general mutation lifecycle', async () => {
  const action = renderHook(() => useOperation('save'))
  const run = vi.fn(async () => {})
  await action
    .run({
      failureMessage: 'Save failed',
      prepare: async () => {
        throw new Error('Disk full')
      },
      run,
    })
    .catch(() => {})
  expect(run).not.toHaveBeenCalled()
  expect(state.error).toHaveBeenCalledOnce()
  state.error.mockClear()
  await action
    .run({
      failureMessage: 'Save failed',
      run: async () => {
        throw new Error('Request failed')
      },
    })
    .catch(() => {})
  expect(state.error).toHaveBeenCalledOnce()
})
it('preserves explicit notification delegation after mutation cleanup', async () => {
  const action = renderHook(() => useOperation('profile'))
  await action
    .run({
      handledError: () => true,
      run: async () => {
        throw new Error('Profile failure')
      },
    })
    .catch(() => {})
  expect(state.error).not.toHaveBeenCalled()
})
it('notifies once for content errors but leaves validation and conflict review to the form', async () => {
  const action = renderHook(() => useContentMutation())
  for (const cause of [
    new Error('Offline'),
    fieldValidationError([{ path: 'title', message: 'Required' }]),
    new Error(CONTENT_CONFLICT),
  ]) {
    await action
      .run({
        id: 'save',
        coordinates,
        kind: 'save',
        title: 'Entry',
        run: async () => {
          throw cause
        },
        confirmed: () => {},
      })
      .catch(() => {})
  }
  expect(state.error).toHaveBeenCalledOnce()
})
it('reports a media failure before an upload has started', async () => {
  const action = renderHook(() => useMediaMutation())
  await action
    .run({
      id: 'upload',
      coordinates,
      kind: 'upload',
      directory: '',
      paths: [],
      run: async () => {
        throw new Error('Upload initialization failed')
      },
    })
    .catch(() => {})
  expect(state.error).toHaveBeenCalledOnce()
})
it('suppresses errors when the initiating account changes during a request', async () => {
  const action = renderHook(() => useOperation('save'))
  await action
    .run({
      failureMessage: 'Save failed',
      run: async () => {
        state.client!.setQueryData(authenticationQueryOptions().queryKey, {
          user: {
            id: 'different',
            name: 'Editor',
            email: 'editor@example.com',
            image: null,
            githubUsername: null,
          },
          profileCompleted: true,
          isAdmin: false,
          methods: { github: true, google: false, email: false },
        })
        throw new Error('Previous account failure')
      },
    })
    .catch(() => {})
  expect(state.error).not.toHaveBeenCalled()
})

it('reports a committed write with a failed local update once, without a success notification', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const confirmed = async () => {
    throw new Error('Cache patch failed')
  }
  await renderHook(() => useContentMutation()).run({
    id: 'save',
    coordinates,
    kind: 'save',
    title: 'Entry',
    run: async () => ({ path: coordinates.path }),
    confirmed,
  })
  expect(state.error).toHaveBeenCalledOnce()
  expect(state.error.mock.calls[0]?.[0]).toContain('operation completed')
  expect(state.success).not.toHaveBeenCalled()
  state.error.mockClear()
  await expect(
    renderHook(() => useOperation('update')).run({
      failureMessage: 'Failed',
      run: async () => ({ saved: true }),
      confirmed,
    }),
  ).rejects.toThrow('operation completed')
  expect(state.error).toHaveBeenCalledOnce()
  expect(state.success).not.toHaveBeenCalled()
  warn.mockRestore()
})

it('fails visibly while offline instead of leaving a paused mutation holding the action lock', async () => {
  onlineManager.setOnline(false)
  try {
    await expect(
      renderHook(() => useOperation('offline')).run({
        failureMessage: 'Could not save.',
        run: async () => {
          throw new TypeError('Failed to fetch')
        },
      }),
    ).rejects.toThrow('Failed to fetch')
    expect(state.error).toHaveBeenCalledOnce()
    expect(state.client!.isMutating()).toBe(0)
  } finally {
    onlineManager.setOnline(true)
  }
})

it('preserves retained-draft recovery instructions after a committed delete', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const message = 'File deleted. A newer local draft was retained for download.'
  await renderHook(() => useContentMutation()).run({
    id: 'delete',
    coordinates,
    kind: 'delete',
    title: 'Entry',
    run: async () => ({ path: coordinates.path }),
    confirmed: async () => {
      throw new OperationAcknowledgementError(
        new Error('Draft changed'),
        message,
      )
    },
  })
  expect(state.error).toHaveBeenCalledExactlyOnceWith(
    message,
    expect.anything(),
  )
  expect(state.success).not.toHaveBeenCalled()
  warn.mockRestore()
})
