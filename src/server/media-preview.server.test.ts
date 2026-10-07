import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mediaPreviewResponse } from './media-preview.server'
import { AccessDeniedError } from './access-policy.server'
import { RepositoryProviderError } from './repository-provider.server'
import type { RequestServices } from './request-services.server'

const asset = vi.hoisted(() => vi.fn())
vi.mock('./media-service.server', () => ({ loadMediaPreview: asset }))
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
