import { createClient } from '@libsql/client'
import { expect, test } from './test'

test.describe('link previews', () => {
  test.use({ javaScriptEnabled: false })
  test('serves the branded card in the HTML of shared app links', async ({
    page,
  }) => {
    for (const path of ['/', '/settings']) {
      const response = await page.goto(path)
      expect(response?.status()).toBe(200)
      await expect(page).toHaveTitle('Pages CMS')
      const description = 'The open-source CMS for GitHub repositories.'
      const image = 'https://app.pagescms.org/images/social-card.png'
      for (const [attribute, key, content] of [
        ['name', 'description', description],
        ['property', 'og:title', 'Pages CMS'],
        ['property', 'og:description', description],
        ['property', 'og:image', image],
        ['property', 'og:image:width', '1200'],
        ['property', 'og:image:height', '630'],
        ['name', 'twitter:card', 'summary_large_image'],
        ['name', 'twitter:image', image],
      ]) {
        await expect(
          page.locator(`head meta[${attribute}="${key}"]`),
        ).toHaveAttribute('content', content)
      }
    }
    const src = await page
      .locator('meta[property="og:image"]')
      .getAttribute('content')
    const image = await page.request.get(new URL(src!).pathname)
    expect(image.ok()).toBe(true)
    expect(image.headers()['content-type']).toContain('image/png')
    const png = await image.body()
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630])
  })
})

test('switches account language in place and restores the profile preference on reload', async ({
  page,
  context,
}) => {
  const failures: string[] = []
  page.on('pageerror', (error) => failures.push(error.message))
  await page.goto('/settings')
  const navigationCount = await page.evaluate(
    () => performance.getEntriesByType('navigation').length,
  )
  await page.evaluate(() => {
    ;(window as unknown as { languageTest: string }).languageTest = 'retained'
  })
  await page
    .getByRole('combobox', { name: 'Interface language', exact: true })
    .click()
  await page.getByRole('option', { name: 'Français', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr')
  await expect(page).toHaveTitle('Compte | Pages CMS')
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    'content',
    'Le CMS open source pour les dépôts GitHub.',
  )
  await expect(page.locator('meta[property="og:description"]')).toHaveAttribute(
    'content',
    'Le CMS open source pour les dépôts GitHub.',
  )
  await expect(
    page.locator('meta[name="twitter:description"]'),
  ).toHaveAttribute('content', 'Le CMS open source pour les dépôts GitHub.')
  await expect(page.locator('head title')).toHaveCount(1)
  await expect(
    page.getByRole('heading', { name: 'Compte', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Préférences', exact: true }),
  ).toBeVisible()
  expect(
    await page.evaluate(
      () => (window as unknown as { languageTest: string }).languageTest,
    ),
  ).toBe('retained')
  expect(
    await page.evaluate(
      () => performance.getEntriesByType('navigation').length,
    ),
  ).toBe(navigationCount)
  const database = createClient({ url: process.env.E2E_DATABASE_URL! })
  try {
    const row = (
      await database.execute(
        "SELECT preferences FROM user WHERE id='playwright-user'",
      )
    ).rows[0]
    expect(JSON.parse(String(row.preferences)).language).toBe('fr')
  } finally {
    database.close()
  }
  await page.screenshot({
    path: '.tmp/i18n-settings-fr-desktop.png',
    fullPage: true,
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(
    page.getByRole('combobox', { name: 'Langue de l’interface', exact: true }),
  ).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
  await page.screenshot({
    path: '.tmp/i18n-settings-fr-mobile.png',
    fullPage: true,
  })
  // A conflicting anonymous cookie must never override a saved profile language.
  await context.addCookies([
    { name: 'pagescms-language', value: 'en', domain: '127.0.0.1', path: '/' },
  ])
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr')
  await expect(
    page.getByRole('heading', { name: 'Préférences', exact: true }),
  ).toBeVisible()
  expect(failures).toEqual([])
})

test.describe('French browser', () => {
  test.use({ locale: 'fr-FR' })
  test('sign-in uses the browser language without a language picker', async ({
    page,
    context,
  }) => {
    await context.clearCookies()
    await page.goto('/sign-in')
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr')
    await expect(
      page.getByRole('heading', { name: 'Se connecter à Pages CMS' }),
    ).toBeVisible()
    await expect(page.getByRole('combobox')).toHaveCount(0)
  })
})

test('language preferences remain isolated across concurrent requests', async ({
  request,
}) => {
  const languages = ['fr', 'en', 'fr', 'en'] as const
  const responses = await Promise.all(
    languages.map((language) =>
      request.get('/api/session', {
        headers: { cookie: `pagescms-language=${language}` },
      }),
    ),
  )
  for (const [index, response] of responses.entries()) {
    expect(response.ok()).toBe(true)
    expect(await response.json()).toMatchObject({ locale: languages[index] })
  }
})

for (const [locale, heading, reload] of [
  ['en', 'Could not start the app', 'Reload page'],
  ['fr', 'Impossible de démarrer l’application', 'Recharger la page'],
  ['es', 'No se pudo iniciar la aplicación', 'Volver a cargar la página'],
  ['pt-BR', 'Não foi possível iniciar o aplicativo', 'Recarregar página'],
  ['zh-CN', '无法启动应用', '重新加载页面'],
] as const) {
  test(`shows usable startup recovery in ${locale} when catalog chunks cannot load`, async ({
    page,
    context,
  }) => {
    test.skip(
      process.env.PAGESCMS_E2E_PRODUCTION !== 'true',
      'Requires production catalog chunks',
    )
    await context.addCookies([
      {
        name: 'pagescms-language',
        value: locale,
        domain: '127.0.0.1',
        path: '/',
      },
    ])
    let blocked = 0
    await page.route('**/assets/messages-*.js', async (route) => {
      blocked++
      await route.abort('failed')
    })
    await page.goto('/sign-in')
    await expect(page.getByText(heading, { exact: true })).toBeVisible()
    expect(blocked).toBeGreaterThan(0)
    await expect(
      page.getByRole('button', { name: reload, exact: true }),
    ).toBeVisible()
    await page.unroute('**/assets/messages-*.js')
    await page.getByRole('button', { name: reload, exact: true }).click()
    await expect(page.getByText(heading, { exact: true })).toHaveCount(0)
    await expect(page.locator('html')).toHaveAttribute('lang', locale)
  })
}

test('localizes implicit media labels and hides the internal default name in its title', async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: 'pagescms-language', value: 'fr', domain: '127.0.0.1', path: '/' },
  ])
  await page.goto('/github/pagescms/fixture/main/media/default')
  await expect(page).toHaveTitle(/^Médias - /)
  expect(await page.title()).not.toContain('default')
  await expect(
    page.locator('main').getByText('Médias', { exact: true }).first(),
  ).toBeVisible()
})
