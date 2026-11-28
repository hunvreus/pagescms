import { expect, test } from './test'

for (const staleMarker of [false, true]) {
  test(`dashboard finishes loading without reload loops (stale deletion marker: ${staleMarker})`, async ({
    page,
  }) => {
    if (staleMarker)
      await page.addInitScript(() => {
        if (sessionStorage.getItem('stale-marker-seeded')) return
        sessionStorage.setItem('stale-marker-seeded', 'true')
        localStorage.setItem(
          'pagescms:deleted-accounts',
          JSON.stringify(['playwright-user']),
        )
      })
    const navigations: string[] = []
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) navigations.push(frame.url())
    })
    await page.goto('/')
    await expect(page.getByPlaceholder('Search by name')).toBeEnabled()
    // Observe a bounded interval: a redirect loop can temporarily render this UI.
    await page.waitForTimeout(1500)
    expect(
      navigations.filter(
        (url) => new URL(url).origin === 'http://127.0.0.1:3100',
      ).length,
    ).toBeLessThanOrEqual(2)
    expect(navigations.some((url) => url.includes('/sign-in'))).toBe(false)
    await expect(page.getByPlaceholder('Search by name')).toBeEnabled()
  })
}
