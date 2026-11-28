import { expect, test } from './test'

test('rejects cross-site API mutations', async ({ request }) => {
  const response = await request.patch('/api/account/preferences', {
    headers: { 'sec-fetch-site': 'cross-site' },
    data: {},
  })
  expect(response.status()).toBe(403)
})
