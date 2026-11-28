import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mediaPreviewResponse } from './preview'
import { MediaNotFoundError } from './provider'
import { AccessDeniedError } from '#/server/access/policy'
import { RepositoryProviderError } from '../repository/provider'
import type { RequestServices } from '#/server/context'

const asset = vi.hoisted(() => vi.fn())
vi.mock('./media', () => ({ loadMediaPreview: asset }))
const params = {
  owner: 'owner',
  repo: 'repo',
  branch: 'main',
  name: 'media',
  _splat: 'images/test.svg',
}

function services() {
  const execute = vi.fn(async (_policy, read: () => Promise<unknown>) => read())
  return {
    getSession: vi.fn().mockResolvedValue({
      user: {
        id: 'editor',
        email: 'editor@example.com',
        emailVerified: true,
      },
    }),
    repositoryAccess: {
      resolve: vi
        .fn()
        .mockResolvedValue({ api: {}, tokenSource: 'installation' }),
    },
    access: { execute },
  } as unknown as RequestServices
}

beforeEach(() => {
  asset.mockClear()
  asset.mockImplementation(async ({ ifNoneMatch }) => ({
    body:
      ifNoneMatch === '"v1"'
        ? null
        : new Response('<svg><script>alert(1)</script></svg>').body,
    etag: '"v1"',
    notModified: ifNoneMatch === '"v1"',
  }))
})

describe('media preview security', () => {
  it('sandboxes SVG and preserves security headers on conditional responses', async () => {
    const service = services()
    const response = await mediaPreviewResponse(
      new Request('http://localhost/media'),
      service,
      params,
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('content-security-policy')).toBe(
      "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    )
    expect(response.headers.get('content-type')).toBe('image/svg+xml')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(service.access.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        principal: { type: 'collaborator', id: 'editor' },
      }),
      expect.any(Function),
    )
    const cached = await mediaPreviewResponse(
      new Request('http://localhost/media', {
        headers: { 'if-none-match': '"v1"' },
      }),
      service,
      params,
    )
    expect(cached.status).toBe(304)
    expect(cached.headers.get('content-security-policy')).toBe(
      response.headers.get('content-security-policy'),
    )
  })
  it.each([
    [
      new AccessDeniedError({ allowed: false, reason: 'permission_denied' }),
      403,
    ],
    [new RepositoryProviderError('secret upstream detail', 404), 404],
    [new MediaNotFoundError(), 404],
    [new Error('secret upstream detail'), 500],
  ])(
    'returns safe errors and meaningful status codes: %s',
    async (error, status) => {
      const log = vi.spyOn(console, 'error').mockImplementation(() => {})
      asset.mockRejectedValueOnce(error)
      const response = await mediaPreviewResponse(
        new Request('http://localhost/media'),
        services(),
        params,
      )
      expect(response.status).toBe(status)
      expect(response.headers.get('content-security-policy')).toContain(
        'sandbox',
      )
      expect(response.headers.get('x-content-type-options')).toBe('nosniff')
      expect(await response.text()).not.toContain(error.message)
      log.mockRestore()
    },
  )
  it('rejects malformed paths before fetching', async () => {
    const service = services()
    const response = await mediaPreviewResponse(
      new Request('http://localhost/media'),
      service,
      { ...params, _splat: '../../secret' },
    )
    expect(response.status).toBe(400)
    expect(service.repositoryAccess.resolve).not.toHaveBeenCalled()
  })
})

it('keeps HTML-looking uploads inert instead of serving them as documents', async () => {
  for (const extension of ['html', 'xhtml', 'xml', 'unknown']) {
    const response = await mediaPreviewResponse(
      new Request('http://localhost/media'),
      services(),
      { ...params, _splat: `images/file.${extension}` },
    )
    expect(response.headers.get('content-type')).toBe(
      'application/octet-stream',
    )
    expect(response.headers.get('content-security-policy')).toContain('sandbox')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
  }
})

it('includes preview protections on authentication and malformed-path errors', async () => {
  const service = services()
  vi.mocked(service.getSession).mockResolvedValueOnce(null)
  const unauthorized = await mediaPreviewResponse(
    new Request('http://localhost/media'),
    service,
    params,
  )
  const invalid = await mediaPreviewResponse(
    new Request('http://localhost/media'),
    services(),
    { ...params, _splat: '../../secret' },
  )
  expect(unauthorized.status).toBe(401)
  expect(invalid.status).toBe(400)
  for (const response of [unauthorized, invalid]) {
    expect(response.headers.get('content-security-policy')).toContain('sandbox')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
  }
})

it('denies access before invoking any preview provider or derivative cache', async () => {
  const service = services()
  vi.mocked(service.access.execute).mockRejectedValueOnce(
    new AccessDeniedError({ allowed: false, reason: 'permission_denied' }),
  )
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  const response = await mediaPreviewResponse(
    new Request('http://localhost/media?variant=thumbnail&revision=v1'),
    service,
    params,
  )
  expect(response.status).toBe(403)
  expect(asset).not.toHaveBeenCalled()
  log.mockRestore()
})

it('passes validated variants and revisions and sends transformed MIME types privately', async () => {
  asset.mockResolvedValueOnce({
    body: new Response('webp').body,
    contentType: 'image/webp',
    etag: '"processed"',
    notModified: false,
  })
  const response = await mediaPreviewResponse(
    new Request('http://localhost/media?variant=thumbnail&revision=v1'),
    services(),
    params,
  )
  expect(asset).toHaveBeenCalledWith(
    expect.objectContaining({ variant: 'thumbnail', revision: 'v1' }),
  )
  expect(response.headers.get('content-type')).toBe('image/webp')
  expect(response.headers.get('cache-control')).toContain('private')
  const invalid = await mediaPreviewResponse(
    new Request('http://localhost/media?variant=arbitrary-resize'),
    services(),
    params,
  )
  expect(invalid.status).toBe(400)
})
