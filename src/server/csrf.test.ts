import { expect, it } from 'vitest'
import { sameOriginRequest } from './csrf'

it.each([
  [{ 'sec-fetch-site': 'same-origin' }, true],
  [{ 'sec-fetch-site': 'same-site', origin: 'https://cms.test' }, false],
  [{ origin: 'https://cms.test' }, true],
  [{ origin: 'https://other.test' }, false],
  [{ referer: 'https://cms.test/settings' }, true],
  [{ referer: 'https://cms.test.attacker.test/' }, false],
  [{ 'sec-fetch-site': 'same-origin', origin: 'https://other.test' }, false],
  [{ origin: 'http://proxy.internal' }, false],
  [{}, false],
])('checks same-origin request headers', (headers, expected) => {
  expect(
    sameOriginRequest(
      new Request('http://proxy.internal/api/example', { headers }),
      'https://cms.test',
    ),
  ).toBe(expected)
})

it('honors the active local development port only for a loopback deployment', () => {
  const request = new Request('http://localhost:5200/api/write', {
    headers: { origin: 'http://localhost:5200' },
  })
  expect(sameOriginRequest(request, 'http://localhost:5100')).toBe(true)
  expect(sameOriginRequest(request, 'https://cms.test')).toBe(false)
  expect(
    sameOriginRequest(
      new Request(request, { headers: { origin: 'http://localhost:5300' } }),
      'http://localhost:5100',
    ),
  ).toBe(false)
})
