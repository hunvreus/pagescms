import { describe, expect, it } from 'vitest'

import {
  parseMediaFolderCreate,
  parseMediaDeliveryRequest,
  parseMediaMove,
  parseMediaRename,
  parseMediaUploadCompletion,
  parseMediaUploadInitiation,
} from './media'

describe('media folder requests', () => {
  it('normalizes nested media folders', () => {
    expect(
      parseMediaFolderCreate({
        owner: ' PagesCMS ',
        repo: 'pages-cms',
        branch: 'main',
        name: 'images',
        path: '/public/images/',
        folder: '2026/launch',
      }),
    ).toMatchObject({
      owner: 'PagesCMS',
      parent: 'public/images',
      folder: '2026/launch',
    })
  })

  it('protects the marker filename', () => {
    expect(() =>
      parseMediaFolderCreate({
        owner: 'PagesCMS',
        repo: 'pages-cms',
        branch: 'main',
        name: 'images',
        folder: '.gitkeep',
      }),
    ).toThrow('invalid')
  })

  it('validates media rename filenames', () => {
    expect(
      parseMediaRename({
        owner: 'PagesCMS',
        repo: 'pages-cms',
        branch: 'main',
        name: 'images',
        path: 'public/images/old.jpg',
        sha: 'sha',
        filename: 'new.jpg',
      }),
    ).toMatchObject({ filename: 'new.jpg' })
    expect(() =>
      parseMediaRename({
        owner: 'PagesCMS',
        repo: 'pages-cms',
        branch: 'main',
        name: 'images',
        path: 'public/images/old.jpg',
        sha: 'sha',
        filename: '../bad.jpg',
      }),
    ).toThrow()
  })

  it('normalizes a media move destination', () => {
    expect(
      parseMediaMove({
        owner: 'PagesCMS',
        repo: 'pages-cms',
        branch: 'main',
        name: 'images',
        path: 'public/images/old.jpg',
        sha: 'sha',
        destination: '/public/images/archive/',
      }),
    ).toMatchObject({ destination: 'public/images/archive' })
  })
})

describe('media delivery requests', () => {
  it('normalizes a bounded set of requested paths', () => {
    expect(
      parseMediaDeliveryRequest({
        owner: 'PagesCMS',
        repo: 'pages-cms',
        branch: 'main',
        name: 'images',
        paths: ['/public/images/a.png', 'public/images/b.png'],
      }).paths,
    ).toEqual(['public/images/a.png', 'public/images/b.png'])
  })

  it('rejects empty and unbounded delivery requests', () => {
    const base = {
      owner: 'PagesCMS',
      repo: 'pages-cms',
      branch: 'main',
      name: 'images',
    }
    expect(() => parseMediaDeliveryRequest({ ...base, paths: [] })).toThrow()
    expect(() =>
      parseMediaDeliveryRequest({
        ...base,
        paths: Array.from({ length: 1001 }, () => 'public/images/a.png'),
      }),
    ).toThrow()
  })
})

describe('direct media upload requests', () => {
  const base = {
    owner: 'PagesCMS',
    repo: 'pages-cms',
    branch: 'main',
    name: 'images',
  }

  it('validates initiation metadata without accepting file bytes', () => {
    expect(
      parseMediaUploadInitiation({
        ...base,
        path: '/public/images/',
        filename: 'hero.png',
        size: 42,
        contentType: 'image/png',
        idempotencyKey: 'upload-1',
      }),
    ).toMatchObject({
      parent: 'public/images',
      filename: 'hero.png',
      size: 42,
    })
    expect(() =>
      parseMediaUploadInitiation({
        ...base,
        filename: 'hero.png',
        size: -1,
        contentType: 'image/png',
        idempotencyKey: 'upload-1',
      }),
    ).toThrow('Invalid media upload initiation')
  })

  it('bounds and validates multipart completion data', () => {
    expect(
      parseMediaUploadCompletion({
        ...base,
        path: 'public/images/hero.png',
        ticket: 'opaque-ticket',
        parts: [{ number: 1, etag: '"etag"' }],
      }),
    ).toMatchObject({
      path: 'public/images/hero.png',
      parts: [{ number: 1, etag: '"etag"' }],
    })
    expect(() =>
      parseMediaUploadCompletion({
        ...base,
        path: 'public/images/hero.png',
        ticket: 'opaque-ticket',
        parts: [{ number: 0, etag: '' }],
      }),
    ).toThrow('Invalid media upload completion')
  })
})
