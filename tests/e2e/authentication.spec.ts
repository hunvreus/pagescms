import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })

test('redirects guests to sign in and serves the health contract', async ({
  page,
  request,
}) => {
  await page.goto('/')

  await expect(
    page.getByRole('heading', { name: 'Sign in to Pages CMS' }),
  ).toBeVisible()
  await expect(
    page.getByText('No sign-in provider is configured.'),
  ).toBeVisible()

  const health = await request.get('/api/health', {
    headers: { 'x-request-id': 'playwright-authentication' },
  })

  expect(health.ok()).toBe(true)
  expect(health.headers()['x-request-id']).toBe('playwright-authentication')
  await expect(health.json()).resolves.toEqual({
    service: 'pagescms',
    status: 'ok',
  })
})
