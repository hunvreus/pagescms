import { QueryClient } from '@tanstack/react-query'
import { afterEach, expect, it, vi } from 'vitest'
import { watchAccountNotifications } from './account-operation'
import { authenticationQueryOptions } from '#/client/queries/session'
import {
  notifyError,
  setNotificationAccount,
  withErrorNotification,
} from '#/lib/notifications'

const notices = vi.hoisted(() => ({ error: vi.fn(), dismiss: vi.fn() }))
vi.mock('sonner', () => ({ toast: notices }))
afterEach(() => {
  setNotificationAccount(undefined)
  vi.clearAllMocks()
})
it('dismisses persistent messages on account changes and rejects late errors from the previous account', () => {
  const client = new QueryClient()
  const key = authenticationQueryOptions().queryKey
  client.setQueryData(key, {
    user: {
      id: 'first',
      name: 'Editor',
      email: 'editor@example.com',
      image: null,
      githubUsername: null,
    },
    profileCompleted: true,
    isAdmin: false,
    methods: { github: true, google: false, email: false },
  })
  const stop = watchAccountNotifications(client)
  notifyError(new Error('Upload failed'), 'Could not upload.', {
    account: 'first',
    duration: Infinity,
  })
  expect(notices.error).toHaveBeenCalledOnce()
  client.setQueryData(key, {
    user: {
      id: 'second',
      name: 'Editor',
      email: 'editor@example.com',
      image: null,
      githubUsername: null,
    },
    profileCompleted: true,
    isAdmin: false,
    methods: { github: true, google: false, email: false },
  })
  expect(notices.dismiss).toHaveBeenCalledOnce()
  notifyError(new Error('Late old error'), 'Could not upload.', {
    account: 'first',
  })
  expect(notices.error).toHaveBeenCalledOnce()
  notifyError(new Error('Current error'), 'Could not save.', {
    account: 'second',
  })
  expect(notices.error).toHaveBeenCalledTimes(2)
  client.clear()
  expect(notices.dismiss).toHaveBeenCalledTimes(2)
  stop()
})

it('keeps an anonymous sign-in error visible when authentication first resolves', () => {
  setNotificationAccount(undefined)
  notices.dismiss.mockClear()
  notifyError(null, 'Sign-in callback failed.')
  setNotificationAccount('editor')
  expect(notices.dismiss).not.toHaveBeenCalled()
})

it('reports a pending operation failure when the account is first initialized', async () => {
  setNotificationAccount(undefined)
  let fail!: (error: Error) => void
  const operation = withErrorNotification(
    () =>
      new Promise<void>((_resolve, reject) => {
        fail = reject
      }),
    'Could not save.',
    { active: () => true },
  )
  setNotificationAccount('editor')
  fail(new Error('Failed to fetch'))
  await expect(operation).rejects.toThrow('Failed to fetch')
  expect(notices.error).toHaveBeenCalledOnce()
})

it('suppresses a pending failure after an account switch', async () => {
  setNotificationAccount('first')
  let fail!: (error: Error) => void
  const operation = withErrorNotification(
    () =>
      new Promise<void>((_resolve, reject) => {
        fail = reject
      }),
    'Could not save.',
    { active: () => true },
  )
  setNotificationAccount('second')
  fail(new Error('Failed to fetch'))
  await expect(operation).rejects.toThrow('Failed to fetch')
  expect(notices.error).not.toHaveBeenCalled()
})
