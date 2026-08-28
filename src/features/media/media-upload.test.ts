import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  MEDIA_UPLOAD_LIMIT,
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
