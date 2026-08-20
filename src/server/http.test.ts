import { describe, expect, it } from 'vitest'

import { getRequestId, withRequestId } from './http'

describe('request correlation', () => {
  it('preserves a valid incoming request id', () => {
    const request = new Request('https://pagescms.test', {
      headers: { 'x-request-id': 'request-123' },
    })

    expect(getRequestId(request)).toBe('request-123')
  })

  it('replaces unsafe request ids', () => {
    const request = new Request('https://pagescms.test', {
      headers: { 'x-request-id': '<script>' },
    })

    expect(getRequestId(request)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
  })

  it('adds the request id without dropping response metadata', async () => {
    const response = withRequestId(
      Response.json({ status: 'ok' }, { status: 201 }),
      'request-123',
    )

    expect(response.status).toBe(201)
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(response.headers.get('x-request-id')).toBe('request-123')
    await expect(response.json()).resolves.toEqual({ status: 'ok' })
  })
})
