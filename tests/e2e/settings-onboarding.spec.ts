import { encryptFixtureToken } from './auth-fixture'
import { createClient } from '@libsql/client'
import { expect, test } from './test'

test.setTimeout(60_000)

test('new accounts confirm their profile before opening a direct content link', async ({
  page,
}) => {
  const database = createClient({ url: process.env.E2E_DATABASE_URL! })
  try {
    await database.execute(
      "update user set onboarding_completed_at = null, image = 'https://example.com/provider.png' where id = 'playwright-user'",
    )
    const destination = '/github/pagescms/fixture/main/file/groups'
    await page.goto('/github/unknown/missing/main')
    await expect(page).toHaveURL(/\/onboarding\?redirect=/)
    await page.goto(destination)
    await expect(page).toHaveURL(/\/onboarding\?redirect=/)
    await expect(
      page.getByRole('heading', { name: 'Confirm your details' }),
    ).toBeVisible()
    await expect(page.getByRole('banner')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'User menu' })).toHaveCount(0)
    await expect(page.locator('[data-slot="card"]')).toBeVisible()
    await expect(
      page.getByRole('checkbox', {
        name: 'Email me about product updates and news.',
      }),
    ).toHaveCount(0)
    const footer = page.locator('[data-slot="card-footer"]')
    await expect(footer.getByRole('button', { name: 'Continue' })).toBeVisible()
    await expect(footer).toHaveCSS('justify-content', /^(flex-end|flow-end)$/)
    await expect(
      page.getByRole('region', { name: 'Welcome to Pages CMS' }),
    ).toHaveCount(0)
    await expect(
      page.getByRole('textbox', { name: 'Display name', exact: true }),
    ).toHaveValue('Playwright Editor')
    await expect(
      page.getByRole('textbox', { name: 'Email', exact: true }),
    ).toHaveValue('editor@example.com')
    await expect(
      page.getByRole('textbox', { name: 'Email', exact: true }),
    ).toHaveAttribute('readonly', '')
    await expect(
      page.getByRole('textbox', { name: 'Email', exact: true }),
    ).toHaveClass(/text-muted-foreground/)
    await expect(
      page.getByRole('textbox', { name: 'GitHub account', exact: true }),
    ).toHaveCount(0)
    await expect(page.locator('[data-slot=field-label]')).toHaveText([
      'Picture',
      'Display name',
      'Email',
    ])
    await expect(page.locator('[data-slot=field-description]')).toHaveCount(0)
    const label = await page
      .getByText('Display name', { exact: true })
      .boundingBox()
    const input = await page
      .getByRole('textbox', { name: 'Display name', exact: true })
      .boundingBox()
    expect(input!.x).toBeGreaterThan(label!.x + label!.width)
    await page
      .getByRole('textbox', { name: 'Display name', exact: true })
      .fill('   ')
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    await expect(
      page.getByText('Name cannot be empty.', { exact: true }),
    ).toBeVisible()
    expect(
      (
        await database.execute(
          "select onboarding_completed_at from user where id = 'playwright-user'",
        )
      ).rows[0].onboarding_completed_at,
    ).toBeNull()
    await page
      .getByRole('textbox', { name: 'Display name', exact: true })
      .fill('Confirmed Editor')
    await page
      .getByRole('button', { name: 'Remove picture', exact: true })
      .click()
    await expect(
      page.getByRole('button', { name: 'Remove picture', exact: true }),
    ).toHaveCount(0)
    await expect(
      page.getByRole('button', { name: 'Reset picture', exact: true }),
    ).toHaveCount(0)
    await page.setViewportSize({ width: 390, height: 844 })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    await expect(page).toHaveURL(destination)
    const account = (
      await database.execute(
        "select name, image, onboarding_completed_at from user where id = 'playwright-user'",
      )
    ).rows[0]
    expect(account.name).toBe('Confirmed Editor')
    expect(account.image).toBeNull()
    expect(account.onboarding_completed_at).not.toBeNull()
    await page.reload()
    await expect(page).toHaveURL(destination)
    await page.goto('/')
    await expect(
      page.getByRole('region', { name: 'Welcome to Pages CMS' }),
    ).toHaveCount(0)
    await expect(
      page.getByRole('heading', { name: 'Open a project', exact: true }),
    ).toBeVisible()
  } finally {
    database.close()
  }
})

test('email users can confirm a name and upload a picture without repository setup tasks', async ({
  page,
}) => {
  const database = createClient({ url: process.env.E2E_DATABASE_URL! })
  try {
    await database.execute(
      "update user set onboarding_completed_at = null, name = email, image = null, github_username = 'disconnected-login' where id = 'playwright-user'",
    )
    await database.execute(
      "delete from account where user_id = 'playwright-user'",
    )
    await page.goto('/')
    await expect(page).toHaveURL('/onboarding')
    await expect(
      page.getByRole('textbox', { name: 'GitHub account', exact: true }),
    ).toHaveCount(0)
    const name = page.getByRole('textbox', {
      name: 'Display name',
      exact: true,
    })
    await expect(name).toHaveValue('')
    await name.fill('Email Editor')
    const upload = page.locator('input[type=file]')
    await upload.setInputFiles({
      name: 'invalid.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from('<svg/>'),
    })
    await expect(
      page.getByText('Choose a PNG, JPEG or WebP picture.'),
    ).toBeVisible()
    const data = await page.evaluate(() => {
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 512
      const context = canvas.getContext('2d')!
      context.fillStyle = '#123456'
      context.fillRect(0, 0, 512, 512)
      return canvas.toDataURL('image/png').split(',')[1]
    })
    await upload.setInputFiles({
      name: 'avatar.png',
      mimeType: 'image/png',
      buffer: Buffer.from(data, 'base64'),
    })
    await expect(
      page.getByRole('button', { name: 'Remove picture', exact: true }),
    ).toBeVisible()
    await expect(
      page.getByText('Choose a PNG, JPEG or WebP picture.'),
    ).toHaveCount(0)
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    await expect(page).toHaveURL('/')
    const account = (
      await database.execute(
        "select image, name, onboarding_completed_at from user where id = 'playwright-user'",
      )
    ).rows[0]
    expect(String(account.image)).toMatch(/^data:image\/(?:webp|png);base64,/)
    expect(account.name).toBe('Email Editor')
    expect(account.onboarding_completed_at).not.toBeNull()
    await expect(
      page.getByText('No projects yet', { exact: true }),
    ).toBeVisible()
    await expect(page.locator('[data-slot=empty]')).toContainText(
      'editor@example.com',
    )
    await expect(
      page.getByRole('link', { name: 'Install GitHub App' }),
    ).toHaveCount(0)
    await page.goto('/settings')
    await page
      .getByRole('button', { name: 'Remove picture', exact: true })
      .click()
    await page
      .getByRole('alertdialog', { name: 'Remove picture?' })
      .getByRole('button', { name: 'Remove picture', exact: true })
      .click()
    await expect(
      page.getByRole('button', { name: 'Remove picture', exact: true }),
    ).toHaveCount(0)
    await page.reload()
    await expect(
      page.getByRole('button', { name: 'Remove picture', exact: true }),
    ).toHaveCount(0)
    await expect(
      page.getByRole('button', { name: 'Reset picture', exact: true }),
    ).toHaveCount(0)
    expect(
      (
        await database.execute(
          "select image from user where id = 'playwright-user'",
        )
      ).rows[0].image,
    ).toBeNull()
  } finally {
    database.close()
  }
})

test('failed profile confirmation keeps the entered values and does not complete onboarding', async ({
  page,
}) => {
  const database = createClient({ url: process.env.E2E_DATABASE_URL! })
  try {
    await database.execute(
      "update user set onboarding_completed_at = null where id = 'playwright-user'",
    )
    await page.goto('/')
    await page
      .getByRole('textbox', { name: 'Display name', exact: true })
      .fill('Retained name')
    let fail = true
    await page.route('**/api/account', async (route) => {
      if (fail && route.request().method() === 'PATCH') {
        fail = false
        await route.abort('failed')
      } else await route.continue()
    })
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    await expect(
      page.getByText('Could not save your profile. Try again.', {
        exact: true,
      }),
    ).toBeVisible()
    await expect(
      page.getByRole('textbox', { name: 'Display name', exact: true }),
    ).toHaveValue('Retained name')
    expect(
      (
        await database.execute(
          "select onboarding_completed_at from user where id = 'playwright-user'",
        )
      ).rows[0].onboarding_completed_at,
    ).toBeNull()
    const saved = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/account' &&
        response.request().method() === 'PATCH',
    )
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    await saved
    await expect(page).toHaveURL('/')
    await expect(async () => {
      const row = (
        await database.execute(
          "select name, onboarding_completed_at from user where id = 'playwright-user'",
        )
      ).rows[0]
      expect(row.name).toBe('Retained name')
      expect(row.onboarding_completed_at).not.toBeNull()
    }).toPass()
  } finally {
    database.close()
  }
})

for (const situation of ['no-accounts', 'no-repositories']) {
  test(`GitHub onboarding gives an actionable empty state: ${situation}`, async ({
    page,
  }) => {
    const database = createClient({ url: process.env.E2E_DATABASE_URL! })
    try {
      await database.execute({
        sql: "update account set access_token = ? where user_id = 'playwright-user'",
        args: [
          await encryptFixtureToken(
            situation === 'no-accounts'
              ? 'empty-accounts-token'
              : 'empty-repositories-token',
          ),
        ],
      })
      await database.execute(
        "update user set github_username = null where id = 'playwright-user'",
      )
      await page.goto('/')
      if (situation === 'no-accounts') {
        await expect(
          page.getByText('Install the GitHub App', { exact: true }),
        ).toBeVisible()
        await expect(
          page.getByRole('link', { name: 'Install GitHub App', exact: true }),
        ).toHaveAttribute('href', '/api/github-app/install')
        await expect(
          page.getByRole('heading', { name: 'Create from a template' }),
        ).toHaveCount(0)
      } else {
        await expect(
          page.getByText('No repositories available', { exact: true }),
        ).toBeVisible()
        await expect(
          page.getByRole('link', {
            name: 'Manage repository access',
            exact: true,
          }),
        ).toHaveAttribute('href', '/api/github-app/install')
        await expect(
          page.getByRole('heading', { name: 'Create from a template' }),
        ).toBeVisible()
        await page.getByPlaceholder('Search by name').fill('missing')
        await expect(
          page.getByText('No matching repositories', { exact: true }),
        ).toBeVisible()
        await page.getByRole('button', { name: 'Reset search' }).click()
        await expect(
          page.getByRole('link', {
            name: 'Manage repository access',
            exact: true,
          }),
        ).toBeVisible()
      }
    } finally {
      database.close()
    }
  })
}

test('shows the confirmed profile while GitHub settings are loading', async ({
  page,
}) => {
  let release!: () => void
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/api/account/settings', async (route) => {
    await held
    await route.continue()
  })
  try {
    await page.goto('/settings')
    const name = page.getByRole('textbox', { name: 'Name', exact: true })
    await expect(name).toHaveValue('Playwright Editor')
    await name.fill('Unsaved profile edit')
    await expect(
      page.getByRole('button', { name: 'GitHub connection actions' }),
    ).toBeDisabled()
    await expect(
      page.getByRole('link', { name: 'Installations', exact: true }),
    ).toHaveCount(0)
    release()
    await expect(
      page.getByRole('button', { name: 'GitHub connection actions' }),
    ).toBeEnabled()
    await expect(name).toHaveValue('Unsaved profile edit')
  } finally {
    release()
  }
})

test('saving a profile updates cached views without refetching repository access', async ({
  page,
}) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'User menu', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Account', exact: true }).click()
  await page.waitForLoadState('networkidle')
  const name = page.getByRole('textbox', { name: 'Name', exact: true })
  await name.fill('   ')
  await name.press('Enter')
  await expect(name).toHaveAttribute('aria-invalid', 'true')
  await expect(
    page
      .locator('[data-sonner-toast]')
      .filter({ hasText: 'Name cannot be empty.' }),
  ).toBeVisible()
  await name.fill('  Updated cached profile  ')
  const methods: string[] = []
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/account')
      methods.push(request.method())
  })
  await name.press('Enter')
  await expect(
    page.locator('[data-sonner-toast]').filter({ hasText: 'Profile updated' }),
  ).toBeVisible()
  await expect(name).toHaveValue('Updated cached profile')
  await page.waitForLoadState('networkidle')
  await page.getByRole('link', { name: 'Back', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'User menu', exact: true }),
  ).toHaveText('UC')
  await page.waitForLoadState('networkidle')
  expect(methods).toEqual(['PATCH'])
})

test('user menus on Projects and repository pages offer Help instead of Getting started', async ({
  page,
}) => {
  for (const url of ['/', '/github/pagescms/fixture/main']) {
    await page.goto(url)
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: 'User menu', exact: true }).click()
    const help = page.getByRole('menuitem', { name: 'Help', exact: true })
    await expect(help).toHaveAttribute('href', 'https://pagescms.org/help/')
    await expect(help).toHaveAttribute('target', '_blank')
    await expect(help.locator('svg')).toHaveCSS('opacity', '0.5')
    await expect(
      page.getByRole('menuitem', { name: 'Getting started', exact: true }),
    ).toHaveCount(0)
    await expect(page.getByRole('menu').getByRole('menuitem')).toHaveText([
      'Admin',
      'Account',
      'Help',
      'Sign out',
    ])
    await page.keyboard.press('Escape')
  }
})

test('unconfigured branches show configuration setup without unavailable destinations or a repo checklist', async ({
  page,
}) => {
  await page.goto('/github/pagescms/fixture/unconfigured')
  await expect(page).toHaveTitle(
    'Overview - pagescms/fixture@unconfigured | Pages CMS',
  )
  await expect(
    page.getByRole('link', { name: 'Overview', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: /^(Actions|Cache)$/ }),
  ).toHaveCount(0)
  for (const name of [
    'Quick links',
    'Recently visited and drafts',
    'Activity',
  ]) {
    await expect(page.getByRole('region', { name, exact: true })).toHaveCount(0)
  }
  await expect(
    page.getByRole('region', { name: 'Repository setup checklist' }),
  ).toHaveCount(0)
  await expect(page.locator('[data-slot="empty"]')).toContainText(
    'No configuration yet',
  )
  await page
    .getByRole('region', { name: 'Repository setup', exact: true })
    .getByRole('link', { name: 'Configure', exact: true })
    .click()
  await expect(page).toHaveURL(
    '/github/pagescms/fixture/unconfigured/configuration',
  )
  await expect(
    page.getByRole('textbox', { name: 'Configuration' }),
  ).toHaveAttribute('contenteditable', 'true')
  await expect(
    page
      .locator('[data-slot="repository-page-header"]')
      .getByRole('button', { name: 'Save', exact: true }),
  ).toBeDisabled()
  await page.goto('/github/pagescms/fixture/unconfigured/actions')
  await expect(page.locator('[data-slot="empty"]')).toContainText(
    'No configuration yet',
  )
  await expect(
    page.getByRole('button', { name: 'Run', exact: true }),
  ).toHaveCount(0)
})

test('recent repositories deduplicate visits by stable repository identity in both lists', async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      'latestVisits:playwright-user',
      JSON.stringify([
        {
          owner: 'PagesCMS',
          repo: 'fixture',
          repoId: '1',
          source: 'github.com',
          branch: 'main',
          timestamp: 10,
        },
        {
          owner: 'pagescms',
          repo: 'fixture',
          repoId: '1',
          source: 'github.com',
          branch: 'main',
          timestamp: 20,
        },
        {
          owner: 'other-owner',
          repo: 'fixture',
          repoId: '2',
          source: 'github.com',
          branch: 'main',
          timestamp: 15,
        },
      ]),
    ),
  )
  await page.goto('/')
  const recent = page.locator('section').filter({
    has: page.getByRole('heading', { name: 'Recently visited', exact: true }),
  })
  await expect(
    recent
      .getByRole('link', { name: 'fixture', exact: true })
      .and(page.locator('[href="/github/pagescms/fixture/main"]')),
  ).toHaveCount(1)
  await expect(
    recent
      .getByRole('link', { name: 'fixture', exact: true })
      .and(page.locator('[href="/github/other-owner/fixture/main"]')),
  ).toHaveCount(1)
  await page.goto('/github/pagescms/fixture/main')
  await page.waitForLoadState('networkidle')
  await page.locator('[data-slot="sidebar-header"] button').click()
  await expect(
    page
      .getByRole('menuitem')
      .and(page.locator('[href="/github/pagescms/fixture/main"]')),
  ).toHaveCount(0)
  await expect(
    page
      .getByRole('menuitem')
      .and(page.locator('[href="/github/other-owner/fixture/main"]')),
  ).toHaveCount(1)
})

test('configured branches without action definitions hide Actions while keeping Overview', async ({
  page,
}) => {
  await page.goto('/github/pagescms/fixture/unconfigured/configuration')
  const editor = page.getByRole('textbox', { name: 'Configuration' })
  await expect(editor).toHaveAttribute('contenteditable', 'true')
  await editor.fill('content: []\n')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(
    page.getByRole('link', { name: 'Overview', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'Actions', exact: true }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('region', { name: 'Repository setup checklist' }),
  ).toHaveCount(0)
})

test('OSS onboarding has no product-news subscription control', async ({
  page,
}) => {
  const database = createClient({ url: process.env.E2E_DATABASE_URL! })
  try {
    await database.execute(
      "update user set onboarding_completed_at = null where id = 'playwright-user'",
    )
    await page.goto('/onboarding')
    await expect(page.getByRole('checkbox')).toHaveCount(0)
    await expect(
      page.getByRole('button', { name: 'Continue', exact: true }),
    ).toBeEnabled()
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    await expect(page).toHaveURL('/')
  } finally {
    database.close()
  }
})
