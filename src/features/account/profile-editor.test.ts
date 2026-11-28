import { OperationAcknowledgementError } from '#/lib/operation-error'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createProfileEditor } from './profile-editor'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

function setup() {
  let profile = {
    name: 'Original',
    image: 'https://example.com/avatar.png' as string | null,
  }
  const active = vi.fn(() => true)
  const notify = vi.fn()
  const save = vi.fn(
    async (update: { name: string; image?: string | null }) => {
      profile = {
        name: update.name,
        image: update.image === undefined ? profile.image : update.image,
      }
      return profile
    },
  )
  const controller = createProfileEditor({
    accountId: 'first',
    profile,
    active,
    save,
    notify,
  })
  return { controller, save, active, notify }
}

it('saves only the latest name when explicitly requested', async () => {
  const { controller, save, notify } = setup()
  controller.setName('First')
  await vi.advanceTimersByTimeAsync(500)
  controller.setName('  Latest  ')
  await vi.advanceTimersByTimeAsync(999)
  expect(save).not.toHaveBeenCalled()
  expect(notify).not.toHaveBeenCalled()
  await controller.saveName()
  expect(save).toHaveBeenCalledExactlyOnceWith({
    accountId: 'first',
    name: 'Latest',
  })
  expect(controller.getSnapshot()).toMatchObject({
    name: 'Latest',
    nameChanged: false,
    namePending: false,
  })
  expect(notify).toHaveBeenCalledExactlyOnceWith({
    type: 'success',
    field: 'name',
  })
})

it('avoids duplicate saves or notifications', async () => {
  const { controller, save, notify } = setup()
  controller.setName('Flushed')
  await controller.saveName()
  await vi.advanceTimersByTimeAsync(5000)
  await controller.saveName()
  expect(save).toHaveBeenCalledTimes(1)
  expect(notify).toHaveBeenCalledTimes(1)
})

it.each([
  ['   ', 'Name cannot be empty.'],
  ['x'.repeat(121), 'Use 120 characters or fewer.'],
])(
  'marks an invalid name and reports its validation message without sending it',
  async (name, message) => {
    const { controller, save, notify } = setup()
    controller.setName(name)
    await controller.saveName()
    expect(save).not.toHaveBeenCalled()
    expect(controller.getSnapshot()).toMatchObject({
      name,
      nameError: message,
      nameChanged: true,
    })
    expect(notify).toHaveBeenCalledWith({
      type: 'error',
      field: 'name',
      error: expect.objectContaining({ message }),
    })
    controller.setImage(null)
    await vi.advanceTimersByTimeAsync(0)
    expect(save).toHaveBeenCalledWith({
      accountId: 'first',
      name: 'Original',
      image: null,
    })
    expect(controller.getSnapshot().name).toBe(name)
  },
)

it('does not save a name draft when saving a picture', async () => {
  const { controller, save } = setup()
  controller.setName('Still typing')
  controller.setImage(null)
  await vi.advanceTimersByTimeAsync(999)
  expect(save).toHaveBeenCalledExactlyOnceWith({
    accountId: 'first',
    name: 'Original',
    image: null,
  })
  await controller.saveName()
  expect(save.mock.calls[1][0]).toEqual({
    accountId: 'first',
    name: 'Still typing',
  })
})

it('serializes writes and reports success only for the latest queued name', async () => {
  const { controller, save, notify } = setup()
  let resolve!: (profile: { name: string; image: string | null }) => void
  save.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  controller.setName('First')
  void controller.saveName()
  controller.setName('Newest')
  void controller.saveName()
  expect(save).toHaveBeenCalledTimes(1)
  resolve({ name: 'First', image: null })
  await vi.advanceTimersByTimeAsync(0)
  expect(save.mock.calls[1][0]).toEqual({ accountId: 'first', name: 'Newest' })
  expect(controller.getSnapshot()).toMatchObject({
    name: 'Newest',
    nameChanged: false,
    saving: false,
  })
  expect(notify).toHaveBeenCalledExactlyOnceWith({
    type: 'success',
    field: 'name',
  })
})

it('leaves a newer name draft unsaved when an earlier save completes', async () => {
  const { controller, save, notify } = setup()
  let resolve!: (profile: { name: string; image: string | null }) => void
  save.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  controller.setName('First')
  void controller.saveName()
  controller.setName('Still editing')
  resolve({ name: 'First', image: null })
  await vi.advanceTimersByTimeAsync(999)
  expect(save).toHaveBeenCalledTimes(1)
  expect(notify).not.toHaveBeenCalled()
  expect(controller.getSnapshot().nameChanged).toBe(true)
  await controller.saveName()
  expect(save.mock.calls[1][0]).toEqual({
    accountId: 'first',
    name: 'Still editing',
  })
  expect(notify).toHaveBeenCalledExactlyOnceWith({
    type: 'success',
    field: 'name',
  })
})

it('retains a failed name without looping and exposes a retry action', async () => {
  const { controller, save, notify } = setup()
  save.mockRejectedValueOnce(new Error('Offline'))
  controller.setName('Retry name')
  await controller.saveName()
  await vi.advanceTimersByTimeAsync(5000)
  expect(save).toHaveBeenCalledTimes(1)
  expect(controller.getSnapshot()).toMatchObject({
    name: 'Retry name',
    nameChanged: true,
    nameSaveError: expect.any(Error),
  })
  const notice = notify.mock.calls[0][0]
  expect(notice).toMatchObject({
    type: 'error',
    field: 'name',
    retry: expect.any(Function),
  })
  notice.retry()
  await vi.advanceTimersByTimeAsync(0)
  expect(save).toHaveBeenCalledTimes(2)
  expect(controller.getSnapshot()).toMatchObject({
    nameChanged: false,
    nameSaveError: null,
  })
  expect(notify).toHaveBeenLastCalledWith({ type: 'success', field: 'name' })
})

it('reasserts the original name after an uncertain response', async () => {
  const { controller, save } = setup()
  save.mockRejectedValueOnce(new Error('Response lost'))
  controller.setName('Possibly saved')
  await controller.saveName()
  controller.setName('Original')
  await controller.saveName()
  expect(save.mock.calls[1][0]).toEqual({
    accountId: 'first',
    name: 'Original',
  })
})

it('keeps the confirmed picture and waits for the server before reporting success', async () => {
  const { controller, save, notify } = setup()
  let resolve!: (profile: { name: string; image: string | null }) => void
  save.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  controller.setImage(null)
  expect(controller.getSnapshot()).toMatchObject({
    image: null,
    confirmedImage: 'https://example.com/avatar.png',
    imagePending: true,
  })
  expect(notify).not.toHaveBeenCalled()
  resolve({ name: 'Original', image: null })
  await vi.advanceTimersByTimeAsync(0)
  expect(controller.getSnapshot()).toMatchObject({
    confirmedImage: null,
    imagePending: false,
  })
  expect(notify).toHaveBeenCalledExactlyOnceWith({
    type: 'success',
    field: 'image',
  })
})

it('retains a failed picture for toast retry without resubmitting it in unrelated name saves', async () => {
  const { controller, save, notify } = setup()
  save.mockRejectedValueOnce(new Error('Offline'))
  controller.setImage(null)
  await vi.advanceTimersByTimeAsync(0)
  const retry = notify.mock.calls[0][0].retry
  expect(controller.getSnapshot()).toMatchObject({
    confirmedImage: 'https://example.com/avatar.png',
    imageSaveError: expect.any(Error),
    imagePending: false,
  })
  controller.setName('Independent')
  await controller.saveName()
  expect(save.mock.calls[1][0]).toEqual({
    accountId: 'first',
    name: 'Independent',
  })
  retry()
  await vi.advanceTimersByTimeAsync(0)
  expect(save.mock.calls[2][0]).toEqual({
    accountId: 'first',
    name: 'Independent',
    image: null,
  })
  expect(controller.getSnapshot()).toMatchObject({
    confirmedImage: null,
    imageSaveError: null,
  })
})

it('lets a queued picture save continue when a pending name fails', async () => {
  const { controller, save } = setup()
  let reject!: (error: Error) => void
  save.mockImplementationOnce(
    () =>
      new Promise((_resolve, fail) => {
        reject = fail
      }),
  )
  controller.setName('Failed')
  void controller.saveName()
  controller.setImage(null)
  void controller.saveName()
  reject(new Error('Offline'))
  await vi.advanceTimersByTimeAsync(5000)
  expect(save.mock.calls.map(([update]) => update)).toEqual([
    { accountId: 'first', name: 'Failed' },
    { accountId: 'first', name: 'Original', image: null },
  ])
  expect(controller.getSnapshot()).toMatchObject({
    name: 'Failed',
    nameSaveError: expect.any(Error),
    confirmedImage: null,
    imagePending: false,
    saving: false,
  })
})

it('reports local picture validation and clears its error without sending a write', () => {
  const { controller, save, notify } = setup()
  controller.setImageError('Choose one picture at a time.')
  expect(controller.getSnapshot().imageError).toBe(
    'Choose one picture at a time.',
  )
  expect(notify).toHaveBeenCalledWith({
    type: 'error',
    field: 'image',
    error: expect.objectContaining({
      message: 'Choose one picture at a time.',
    }),
  })
  controller.setImageError()
  expect(controller.getSnapshot().imageError).toBeUndefined()
  expect(save).not.toHaveBeenCalled()
})

it('does not leave unchanged pictures pending or report a redundant success', () => {
  const { controller, save, notify } = setup()
  controller.setImage('https://example.com/avatar.png')
  expect(controller.getSnapshot().imagePending).toBe(false)
  expect(save).not.toHaveBeenCalled()
  expect(notify).not.toHaveBeenCalled()
})

it('abandons queued edits after the signed-in account changes', async () => {
  const { controller, save, active, notify } = setup()
  controller.setName('Old account')
  active.mockReturnValue(false)
  await controller.saveName()
  expect(save).not.toHaveBeenCalled()
  expect(notify).not.toHaveBeenCalled()
  expect(controller.getSnapshot().name).toBe('')
})

it.each(['success', 'failure'])(
  'suppresses %s notifications after a pending request changes account',
  async (result) => {
    const { controller, save, active, notify } = setup()
    let resolve!: (profile: { name: string; image: string | null }) => void
    let reject!: (error: Error) => void
    save.mockImplementationOnce(
      () =>
        new Promise((done, fail) => {
          resolve = done
          reject = fail
        }),
    )
    controller.setName('Old account')
    void controller.saveName()
    active.mockReturnValue(false)
    if (result === 'success') resolve({ name: 'Old account', image: null })
    else reject(new Error('Offline'))
    await vi.advanceTimersByTimeAsync(5000)
    expect(save).toHaveBeenCalledTimes(1)
    expect(notify).not.toHaveBeenCalled()
    expect(controller.getSnapshot()).toMatchObject({
      name: '',
      saving: false,
      namePending: false,
    })
  },
)

it('accepts a committed save with failed local acknowledgement without retrying the same value', async () => {
  const { controller, save, notify } = setup()
  const error = new OperationAcknowledgementError(
    new Error('Cache update failed'),
  )
  save.mockRejectedValueOnce(error)
  controller.setName('Saved name')
  await controller.saveName()
  expect(controller.getSnapshot()).toMatchObject({
    name: 'Saved name',
    nameChanged: false,
    nameSaveError: null,
    saving: false,
  })
  expect(notify).toHaveBeenCalledOnce()
  expect(notify).toHaveBeenCalledWith({ type: 'error', field: 'name', error })
  await controller.saveName()
  expect(save).toHaveBeenCalledOnce()
  controller.setName('Another edit')
  await controller.saveName()
  expect(save).toHaveBeenCalledTimes(2)
})
