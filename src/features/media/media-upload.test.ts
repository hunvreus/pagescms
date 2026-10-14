import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  MEDIA_UPLOAD_LIMIT,
  MediaUploadError,
  uploadMediaFiles,
  validateMediaUpload,
} from './media-upload'

const mediaFunctions = vi.hoisted(() => ({
  abortMediaUpload: vi.fn(),
  confirmMediaUpload: vi.fn(),
  createMedia: vi.fn(),
  initiateMediaUpload: vi.fn(),
}))

vi.mock('#/functions/media', () => mediaFunctions)

const notifications = vi.hoisted(() => ({
  loading: vi.fn(() => 'batch'),
  success: vi.fn(),
  error: vi.fn(),
  dismiss: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: notifications }))

const coordinates = {
  owner: 'owner',
  repo: 'repo',
  branch: 'main',
  name: 'media',
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

describe('validateMediaUpload', () => {
  it('matches file extensions case-insensitively', () => {
    expect(() =>
      validateMediaUpload({ name: 'Photo.JPG', size: 10 }, ['jpg']),
    ).not.toThrow()
  })

  it('rejects disallowed extensions', () => {
    expect(() =>
      validateMediaUpload({ name: 'document.pdf', size: 10 }, ['jpg']),
    ).toThrow('document.pdf uses a disallowed file extension')
  })

  it('rejects files above the upload limit', () => {
    expect(() =>
      validateMediaUpload({
        name: 'large.jpg',
        size: MEDIA_UPLOAD_LIMIT + 1,
      }),
    ).toThrow('large.jpg exceeds the 20 MB limit')
  })
})

describe('uploadMediaFiles direct uploads', () => {
  it('aborts a direct upload when the object transfer fails', async () => {
    mediaFunctions.initiateMediaUpload.mockResolvedValue({
      kind: 'direct',
      path: 'images/photo.jpg',
      plan: {
        kind: 'post',
        url: 'https://uploads.example.test',
        fields: {},
        ticket: 'ticket',
      },
    })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 503 }),
    )

    await expect(
      uploadMediaFiles({
        coordinates,
        files: [new File(['photo'], 'photo.jpg', { type: 'image/jpeg' })],
        path: 'images',
      }),
    ).rejects.toThrow('photo.jpg failed with status 503')

    expect(mediaFunctions.abortMediaUpload).toHaveBeenCalledOnce()
    expect(mediaFunctions.confirmMediaUpload).not.toHaveBeenCalled()
  })

  it('does not abort an uploaded object when confirmation fails', async () => {
    vi.useFakeTimers()
    mediaFunctions.initiateMediaUpload.mockResolvedValue({
      kind: 'direct',
      path: 'images/photo.jpg',
      plan: {
        kind: 'post',
        url: 'https://uploads.example.test',
        fields: {},
        ticket: 'ticket',
      },
    })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 204 }),
    )
    mediaFunctions.confirmMediaUpload.mockRejectedValue(
      new Error('confirmation unavailable'),
    )

    const result = uploadMediaFiles({
      coordinates,
      files: [new File(['photo'], 'photo.jpg', { type: 'image/jpeg' })],
      path: 'images',
    })
    const rejection = expect(result).rejects.toThrow('confirmation unavailable')
    await vi.runAllTimersAsync()

    await rejection
    expect(mediaFunctions.confirmMediaUpload).toHaveBeenCalledTimes(3)
    expect(mediaFunctions.abortMediaUpload).not.toHaveBeenCalled()
  })

  it('recovers when idempotent confirmation succeeds on retry', async () => {
    vi.useFakeTimers()
    mediaFunctions.initiateMediaUpload.mockResolvedValue({
      kind: 'direct',
      path: 'images/photo.jpg',
      plan: {
        kind: 'post',
        url: 'https://uploads.example.test',
        fields: {},
        ticket: 'ticket',
      },
    })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 204 }),
    )
    mediaFunctions.confirmMediaUpload
      .mockRejectedValueOnce(new Error('confirmation unavailable'))
      .mockResolvedValueOnce({ path: 'images/photo.jpg' })

    const result = uploadMediaFiles({
      coordinates,
      files: [new File(['photo'], 'photo.jpg', { type: 'image/jpeg' })],
      path: 'images',
    })
    await vi.runAllTimersAsync()

    await expect(result).resolves.toEqual(['images/photo.jpg'])
    expect(mediaFunctions.confirmMediaUpload).toHaveBeenCalledTimes(2)
    expect(mediaFunctions.abortMediaUpload).not.toHaveBeenCalled()
  })
})

it('reports a partial batch and preserves confirmed files when a later upload fails', async () => {
  mediaFunctions.initiateMediaUpload.mockResolvedValue({
    kind: 'direct',
    path: 'images/Photo.JPG',
    plan: {
      kind: 'post',
      url: 'https://uploads.example.test',
      fields: {},
      ticket: 'ticket',
    },
  })
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(null, { status: 204 }),
  )
  mediaFunctions.confirmMediaUpload.mockResolvedValue({
    path: 'images/Photo.JPG',
  })
  const onUploaded = vi.fn()
  const failure = await uploadMediaFiles({
    coordinates,
    onUploaded,
    extensions: ['JPG'],
    files: [new File(['a'], 'Photo.JPG'), new File(['b'], 'bad.pdf')],
    path: 'images',
  }).catch((error) => error)
  expect(failure).toBeInstanceOf(MediaUploadError)
  expect(failure.paths).toEqual(['images/Photo.JPG'])
  expect(onUploaded).toHaveBeenCalledOnce()
  expect(onUploaded).toHaveBeenCalledWith(
    { path: 'images/Photo.JPG' },
    expect.objectContaining({ name: 'Photo.JPG' }),
    0,
  )
  expect(notifications.error).toHaveBeenCalledWith(
    '1 of 2 files uploaded',
    expect.objectContaining({
      id: 'batch',
      description: 'bad.pdf uses a disallowed file extension',
    }),
  )
  expect(notifications.success).not.toHaveBeenCalled()
})

it('updates one batch notification through completion', async () => {
  mediaFunctions.initiateMediaUpload.mockResolvedValue({
    kind: 'direct',
    path: 'images/photo.jpg',
    plan: {
      kind: 'post',
      url: 'https://uploads.example.test',
      fields: {},
      ticket: 'ticket',
    },
  })
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(null, { status: 204 }),
  )
  mediaFunctions.confirmMediaUpload.mockResolvedValue({
    path: 'images/photo.jpg',
  })
  await uploadMediaFiles({
    coordinates,
    files: [new File(['a'], 'a.jpg'), new File(['b'], 'b.jpg')],
    path: 'images',
  })
  expect(notifications.loading).toHaveBeenCalledWith(
    'Uploading 2 of 2 files…',
    { id: 'batch' },
  )
  expect(notifications.success).toHaveBeenCalledWith('2 files uploaded', {
    id: 'batch',
  })
})

it('a local acknowledgement error never retries or fails a confirmed upload', async () => {
  mediaFunctions.initiateMediaUpload.mockResolvedValue({
    kind: 'direct',
    path: 'images/photo.jpg',
    plan: {
      kind: 'post',
      url: 'https://uploads.example.test',
      fields: {},
      ticket: 'ticket',
    },
  })
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(null, { status: 204 }),
  )
  mediaFunctions.confirmMediaUpload.mockResolvedValue({
    path: 'images/photo.jpg',
    version: 'confirmed-version',
    revision: null,
  })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  const onUploaded = vi.fn(() => {
    throw new Error('local view failed')
  })
  await expect(
    uploadMediaFiles({
      coordinates,
      files: [new File(['photo'], 'photo.jpg')],
      path: 'images',
      onUploaded,
    }),
  ).resolves.toEqual(['images/photo.jpg'])
  expect(mediaFunctions.confirmMediaUpload).toHaveBeenCalledOnce()
  expect(onUploaded).toHaveBeenCalledOnce()
  expect(notifications.success).toHaveBeenCalled()
  expect(notifications.error).not.toHaveBeenCalled()
})

it('stops a batch before another file can be written using a different signed-in account', async () => {
  let active = true
  mediaFunctions.initiateMediaUpload.mockResolvedValue({
    kind: 'direct',
    path: 'images/first.jpg',
    plan: {
      kind: 'post',
      url: 'https://uploads.example.test',
      fields: {},
      ticket: 'ticket',
    },
  })
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(null, { status: 204 }),
  )
  mediaFunctions.confirmMediaUpload.mockResolvedValue({
    path: 'images/first.jpg',
    version: 'v1',
    revision: null,
  })
  const result = await uploadMediaFiles({
    coordinates,
    files: [new File(['a'], 'first.jpg'), new File(['b'], 'second.jpg')],
    path: 'images',
    isActive: () => active,
    onUploaded: () => {
      active = false
    },
  }).catch((error) => error)
  expect(result).toBeInstanceOf(MediaUploadError)
  expect(result.paths).toEqual(['images/first.jpg'])
  expect(mediaFunctions.initiateMediaUpload).toHaveBeenCalledOnce()
  expect(notifications.success).not.toHaveBeenCalled()
  expect(notifications.error).not.toHaveBeenCalled()
  expect(notifications.dismiss).toHaveBeenCalledWith('batch')
})
it('never confirms an object under a new account after its transfer finishes', async () => {
  let active = true
  mediaFunctions.initiateMediaUpload.mockResolvedValue({
    kind: 'direct',
    path: 'images/first.jpg',
    plan: {
      kind: 'post',
      url: 'https://uploads.example.test',
      fields: {},
      ticket: 'ticket',
    },
  })
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
    active = false
    return new Response(null, { status: 204 })
  })
  await expect(
    uploadMediaFiles({
      coordinates,
      files: [new File(['a'], 'first.jpg')],
      path: 'images',
      isActive: () => active,
    }),
  ).rejects.toThrow('signed-in account changed')
  expect(mediaFunctions.confirmMediaUpload).not.toHaveBeenCalled()
  expect(mediaFunctions.abortMediaUpload).not.toHaveBeenCalled()
  expect(notifications.error).not.toHaveBeenCalled()
})
