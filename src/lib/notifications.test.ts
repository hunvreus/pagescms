import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fieldValidationError,
  fieldValidationIssues,
} from '#/shared/field-validation-error'
import { CONTENT_CONFLICT, isContentConflict } from '#/shared/content-conflict'
import { notifyError, withErrorNotification } from './notifications'

const errorToast = vi.hoisted(() => vi.fn())
vi.mock('sonner', () => ({ toast: { error: errorToast, dismiss: vi.fn() } }))
beforeEach(() => errorToast.mockClear())

describe('action failure presentation', () => {
  it('reports a failed preparation once and preserves the thrown error for recovery', async () => {
    const error = new Error('Could not persist the draft')
    const dispatch = vi.fn()
    const prepare = vi.fn(async () => {
      throw error
    })
    await expect(
      withErrorNotification(async () => {
        await prepare()
        await dispatch()
      }, 'Could not save.'),
    ).rejects.toBe(error)
    expect(errorToast).toHaveBeenCalledOnce()
    expect(dispatch).not.toHaveBeenCalled()
  })
  it('allows an outer action to own a delegated failure without duplicate notification', async () => {
    const error = new Error('Request failed')
    await expect(
      withErrorNotification(
        () =>
          withErrorNotification(
            async () => {
              throw error
            },
            'Inner',
            { handled: () => true },
          ),
        'Could not save.',
      ),
    ).rejects.toBe(error)
    expect(errorToast).toHaveBeenCalledOnce()
  })
  it('does not suppress a new failed retry, even when a provider reuses an Error', async () => {
    const error = new Error('Offline')
    for (let i = 0; i < 2; i++)
      await withErrorNotification(async () => {
        throw error
      }, 'Could not save.').catch(() => {})
    expect(errorToast).toHaveBeenCalledTimes(2)
  })
  it('leaves explicitly handled field validation and conflicts to their recovery UI', async () => {
    const errors = [
      fieldValidationError([{ path: 'title', message: 'Required' }]),
      new Error(CONTENT_CONFLICT),
    ]
    for (const error of errors)
      await expect(
        withErrorNotification(
          async () => {
            throw error
          },
          'Could not save.',
          {
            handled: (cause) =>
              Boolean(fieldValidationIssues(cause)) || isContentConflict(cause),
          },
        ),
      ).rejects.toBe(error)
    expect(errorToast).not.toHaveBeenCalled()
  })
  it('does not notify a different account when the initiating action finishes', async () => {
    let active = true
    await withErrorNotification(
      async () => {
        active = false
        throw new Error('Old account failure')
      },
      'Could not save.',
      { active: () => active },
    ).catch(() => {})
    expect(errorToast).not.toHaveBeenCalled()
  })
  it('uses contextual copy for transport failures and retains retry actions', () => {
    const retry = { label: 'Retry', onClick: vi.fn() }
    notifyError(new TypeError('Failed to fetch'), 'Could not save.', {
      id: 'save',
      action: retry,
    })
    expect(errorToast).toHaveBeenCalledWith(
      'Could not save.',
      expect.objectContaining({ id: 'save', action: retry }),
    )
  })
  it('normalizes access denials and retains their recovery link', () => {
    notifyError(
      { reason: 'feature_unavailable', actionUrl: '/billing' },
      'Could not save.',
    )
    expect(errorToast).toHaveBeenCalledWith(
      'This feature is not available for this account.',
      expect.objectContaining({
        action: expect.objectContaining({ label: 'Learn more' }),
      }),
    )
  })
})

it('rejects unsafe denial recovery URLs and prefers a valid recovery link over Retry', () => {
  for (const actionUrl of ['javascript:alert(1)', '//attacker.example']) {
    notifyError({ reason: 'permission_denied', actionUrl }, 'Denied', {
      action: { label: 'Retry', onClick: vi.fn() },
    })
    expect(errorToast.mock.calls.at(-1)?.[1].action).toBeUndefined()
  }
  notifyError(
    { reason: 'feature_unavailable', actionUrl: '/billing' },
    'Denied',
    { action: { label: 'Retry', onClick: vi.fn() } },
  )
  expect(errorToast.mock.calls.at(-1)?.[1].action.label).toBe('Learn more')
})

it('preserves the original failure and reports once if its classifier throws', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const original = new Error('Request failed')
  await expect(
    withErrorNotification(
      async () => {
        throw original
      },
      'Could not save.',
      {
        handled: () => {
          throw new Error('Bad classifier')
        },
      },
    ),
  ).rejects.toBe(original)
  expect(errorToast).toHaveBeenCalledOnce()
  warn.mockRestore()
})

it('does not replace a committed-write warning with an ineffective Retry action', async () => {
  const { OperationAcknowledgementError } = await import('./operation-error')
  notifyError(
    new OperationAcknowledgementError(new Error('Local failure')),
    'Could not save.',
    { action: { label: 'Retry', onClick: vi.fn() } },
  )
  expect(errorToast.mock.calls.at(-1)?.[0]).toContain('operation completed')
  expect(errorToast.mock.calls.at(-1)?.[1].action).toBeUndefined()
})
