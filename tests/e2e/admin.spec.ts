import { expect, test } from './test'
import { eq, inArray } from 'drizzle-orm'
import { createDatabase } from '#/server/database/client.server'
import { actionRunTable, collaboratorTable } from '#/server/database/schema'
import { configuration } from './github-fixture.server'

const repository = '/pagescms/fixture/main'
test.describe.configure({ mode: 'serial' })

test('runs dialog keeps its geometry while loading', async ({ page }) => {
  await page.goto(`${repository}/settings`)
  await page.waitForLoadState('networkidle')
  await page.route('**/_serverFn/**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 400))
    await route.continue()
  })
  await page
    .getByRole('region', { name: 'Actions', exact: true })
    .getByRole('button', { name: 'View runs', exact: true })
    .first()
    .click()
  const dialog = page.getByRole('dialog', { name: 'Action runs' })
  await expect(dialog).toBeVisible()
  const heights = await dialog.evaluate(async (element) => {
    const samples: number[] = []
    const started = performance.now()
    while (performance.now() - started < 1000) {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      )
      if (performance.now() - started > 120)
        samples.push(element.getBoundingClientRect().height)
    }
    return samples
  })
  expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(2)
})

test('collaborator removal requires confirmation', async ({ page }) => {
  const url = process.env.E2E_DATABASE_URL
  if (!url) throw new Error('Isolated browser database is required')
  const database = createDatabase({ url })
  const [collaborator] = await database
    .insert(collaboratorTable)
    .values({
      type: 'github',
      installationId: 1,
      ownerId: 1,
      owner: 'pagescms',
      repo: 'fixture',
      branch: 'main',
      email: 'table-action@example.com',
    })
    .returning({ id: collaboratorTable.id })
  try {
    await page.goto(`${repository}/settings`)
    await page.waitForLoadState('networkidle')
    const remove = page.getByRole('button', {
      name: 'Remove table-action@example.com',
    })
    await expect(remove).toHaveText('Remove')
    await remove.click()
    const confirmation = page.getByRole('alertdialog', {
      name: 'Remove collaborator?',
    })
    await expect(confirmation).toBeVisible()
    await confirmation.getByRole('button', { name: 'Cancel' }).click()
    await expect(remove).toBeVisible()
  } finally {
    await database
      .delete(collaboratorTable)
      .where(eq(collaboratorTable.id, collaborator.id))
  }
})

test('settings condenses administration and loads details on demand', async ({
  page,
}) => {
  await page.goto(`${repository}/settings`)
  await page.waitForLoadState('networkidle')
  const header = page.locator('[data-slot="repository-page-header"]')
  await expect(header.getByRole('heading', { name: 'Settings' })).toBeVisible()
  const configurationSection = page.getByRole('region', {
    name: 'Configuration',
    exact: true,
  })
  const configurationEditor = configurationSection.getByRole('textbox', {
    name: 'Pages CMS configuration',
  })
  await expect(configurationEditor).toHaveAttribute('contenteditable', 'false')
  await expect(
    configurationSection.getByText(
      'Define content, fields, media, and repository actions.',
      { exact: true },
    ),
  ).toHaveCount(0)
  await expect(
    configurationSection.getByRole('button', {
      name: 'About configuration',
      exact: true,
    }),
  ).toHaveCount(0)
  const collaboratorsEmpty = page.getByRole('cell', {
    name: 'No collaborators yet.',
    exact: true,
  })
  expect(
    await collaboratorsEmpty.evaluate(
      (element) => element.getBoundingClientRect().height,
    ),
  ).toBeLessThan(50)
  await expect(
    configurationSection.locator('[data-slot="configuration-preview"]'),
  ).toHaveCSS('height', '160px')
  await expect(page.getByRole('heading', { name: 'Recent runs' })).toHaveCount(
    0,
  )
  await expect(
    page.getByRole('table', { name: 'Cached directories' }),
  ).not.toBeVisible()
  const cache = page.getByRole('region', { name: 'Cache', exact: true })
  await expect(
    cache.getByRole('button', { name: 'Refresh content cache' }),
  ).toBeVisible()
  await expect(
    cache.getByRole('button', { name: 'View directories' }),
  ).toHaveCount(0)
  const checked = cache.getByText(/^Last checked /)
  await expect(checked).toContainText(/Last checked .+ ago/)
  await expect(
    checked
      .locator('..')
      .getByRole('heading', { name: 'Configuration', exact: true }),
  ).toBeVisible()
  await checked.hover()
  await expect(page.getByRole('tooltip')).toContainText(/GMT|UTC/)
  await page.mouse.move(0, 0)
  const contentBadge = cache.getByText(/^\d+ files$/)
  const directoryBadge = cache.getByText(/^\d+ directories$/)
  await expect(contentBadge).toBeVisible()
  await expect(directoryBadge).toBeVisible()
  if (
    (await contentBadge.textContent()) === '0 files' &&
    (await directoryBadge.textContent()) === '0 directories'
  ) {
    await expect(
      cache.getByRole('button', { name: 'Refresh content cache', exact: true }),
    ).toBeDisabled()
    await expect(
      cache.getByRole('button', { name: 'Clear content cache', exact: true }),
    ).toBeDisabled()
  }
  await expect(
    cache.getByRole('button', {
      name: 'Refresh configuration cache',
      exact: true,
    }),
  ).toBeEnabled()
  await cache.getByRole('button', { name: 'Clear all', exact: true }).click()
  await expect(
    page.getByRole('alertdialog', { name: 'Clear all cached data?' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()

  const actions = page.getByRole('region', { name: 'Actions', exact: true })
  await expect(
    actions.getByRole('group', { name: 'Run Deploy site' }),
  ).toBeVisible()
  await actions
    .getByRole('button', { name: 'More options for Deploy site' })
    .click()
  const actionMenu = page.getByRole('menu')
  await expect(
    actionMenu.locator('[data-slot="dropdown-menu-separator"]'),
  ).toHaveCount(1)
  await expect(
    actionMenu.getByRole('menuitem', { name: 'View on GitHub' }),
  ).toHaveAttribute(
    'href',
    'https://github.com/pagescms/fixture/actions/workflows/deploy.yml?query=branch%3Amain',
  )
  await actionMenu
    .getByRole('menuitem', { name: 'View runs', exact: true })
    .click()
  await expect(page).toHaveURL(/dialog=runs&action=deploy/)
  await expect(
    page
      .getByRole('dialog', { name: 'Action runs' })
      .getByRole('combobox', { name: 'Filter runs by action' }),
  ).toContainText('Deploy site')
  await page.keyboard.press('Escape')
  await actions.getByRole('button', { name: 'Run', exact: true }).click()
  await expect(
    page.getByRole('alertdialog', { name: 'Deploy site?' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await actions.getByRole('button', { name: 'View runs' }).click()
  await expect(page).toHaveURL(/dialog=runs/)
  await expect(page.getByRole('dialog', { name: 'Action runs' })).toBeVisible()
  const runsDialog = page.getByRole('dialog', { name: 'Action runs' })
  await expect(
    runsDialog.getByRole('combobox', { name: 'Filter runs by action' }),
  ).toContainText('All actions')
  await expect(runsDialog.locator('[data-slot="dialog-title"]')).toBeVisible()
  await expect(
    runsDialog.locator('[data-slot="dialog-description"]'),
  ).toHaveText('Inspect recent workflow runs and open their logs on GitHub.')
  await expect(
    runsDialog.getByRole('heading', { name: 'Recent runs' }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('navigation', { name: 'Action runs pagination' }),
  ).toHaveCount(0)
  await page.keyboard.press('Escape')

  const collaborators = page.getByRole('region', {
    name: 'Collaborators',
    exact: true,
  })
  await expect(
    collaborators.getByRole('columnheader', { name: 'Email' }),
  ).toBeVisible()
  await collaborators
    .getByRole('button', { name: 'Invite collaborator' })
    .click()
  await expect(
    page.getByRole('dialog', { name: 'Invite collaborators' }),
  ).toBeVisible()
  await expect(page.getByLabel('Email addresses')).toBeVisible()
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'Edit configuration' }).click()
  await expect(page).toHaveURL(/edit=configuration/)
  const dialog = configurationSection
  const editor = dialog.getByRole('textbox', {
    name: 'Pages CMS configuration',
  })
  await expect(editor).toContainText('content:')
  await expect(
    dialog.getByRole('button', { name: 'Save', exact: true }),
  ).toBeDisabled()
  await expect(editor).toHaveAttribute('contenteditable', 'true')
  await expect(editor).toBeFocused()
  await expect(dialog.locator('.cm-scroller')).toHaveCSS('overflow-y', 'auto')
  await editor.fill('# Short configuration')
  const shortHeight = await dialog
    .locator('.pagescms-code-editor')
    .evaluate((element) => element.getBoundingClientRect().height)
  await editor.fill(
    Array.from({ length: 100 }, (_, index) => `# Line ${index}`).join('\n'),
  )
  await expect
    .poll(() =>
      dialog
        .locator('.pagescms-code-editor')
        .evaluate((element) => element.getBoundingClientRect().height),
    )
    .toBeGreaterThan(shortHeight)
  await expect(
    page.getByRole('dialog', { name: 'Edit configuration' }),
  ).toHaveCount(0)
  const footer = dialog.locator('div.flex.min-h-7').first()
  await expect(
    footer.getByRole('button', { name: 'Save', exact: true }),
  ).toBeVisible()
  await expect(
    footer.getByRole('button', { name: 'Cancel', exact: true }),
  ).toBeVisible()
  await expect(
    footer.getByRole('link', { name: 'View configuration on GitHub' }),
  ).toHaveText('View on GitHub')
  await expect(
    dialog.getByRole('link', { name: 'View configuration on GitHub' }),
  ).toHaveAttribute(
    'href',
    'https://github.com/pagescms/fixture/blob/main/.pages.yml',
  )
  await editor.fill('content: [')
  await expect(
    dialog.locator('.cm-lintRange-error, .cm-lintPoint-error'),
  ).not.toHaveCount(0)
  await expect(dialog.locator('[data-slot="field-error"]')).toHaveCount(0)
  await expect(
    dialog.getByRole('button', { name: 'Save', exact: true }),
  ).toBeDisabled()
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(
    page.getByRole('alertdialog', { name: 'Discard configuration changes?' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Keep editing' }).click()
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('button', { name: 'Discard changes' }).click()
  await expect(editor).toHaveAttribute('contenteditable', 'false')
  await expect(
    dialog.getByRole('button', { name: 'Edit configuration' }),
  ).toBeVisible()
  await dialog.getByRole('button', { name: 'Edit configuration' }).click()
  await editor.fill(`# Saved inline\n${configuration}`)
  await dialog.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(editor).toHaveAttribute('contenteditable', 'false')
  await expect(editor).toContainText('# Saved inline')
  await dialog.getByRole('button', { name: 'Edit configuration' }).click()
  await editor.fill(configuration)
  await dialog.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(editor).toHaveAttribute('contenteditable', 'false')
})

test('action run pagination shows ten rows and keeps the dialog open between pages', async ({
  page,
}) => {
  const url = process.env.E2E_DATABASE_URL
  if (!url) throw new Error('Isolated browser database is required')
  const database = createDatabase({ url })
  const rows = await database
    .insert(actionRunTable)
    .values(
      Array.from({ length: 14 }, (_, index) => ({
        owner: 'pagescms',
        repo: 'fixture',
        ref: 'main',
        workflowRef: 'main',
        sha: `pagination-${index}`,
        actionName: index < 12 ? 'deploy' : 'archived-action',
        workflow: 'deploy.yml',
        contextType: 'repository',
        status: 'completed',
        conclusion: 'success',
        triggeredBy: { name: `Pager ${index}`, userId: 'playwright-user' },
        payload: {},
        createdAt: new Date(1_700_000_000_000 + index * 1000),
      })),
    )
    .returning({ id: actionRunTable.id })
  try {
    await page.goto(`${repository}/settings?dialog=runs&action=deploy`)
    const dialog = page.getByRole('dialog', { name: 'Action runs' })
    const bodyRows = dialog.locator('tbody tr')
    await expect(bodyRows).toHaveCount(10)
    const pager = dialog.getByRole('navigation', {
      name: 'Action runs pagination',
    })
    await expect(pager.getByText('Page 1 of 2')).toBeVisible()
    await expect(pager.getByRole('button', { name: 'Previous' })).toBeDisabled()
    await expect(dialog.getByText('Pager 11', { exact: true })).toBeVisible()
    await pager.getByRole('button', { name: 'Next' }).click()
    await expect(bodyRows).toHaveCount(2)
    await expect(pager.getByText('Page 2 of 2')).toBeVisible()
    await expect(pager.getByRole('button', { name: 'Next' })).toBeDisabled()
    await expect(dialog.getByText('Pager 0', { exact: true })).toBeVisible()
    await pager.getByRole('button', { name: 'Previous' }).click()
    await expect(bodyRows).toHaveCount(10)
    await expect(dialog).toBeVisible()
    const search = dialog.getByRole('textbox', { name: 'Search action runs' })
    await search.fill('Pager 0')
    await expect(bodyRows).toHaveCount(1)
    await expect(dialog.getByText('Pager 0', { exact: true })).toBeVisible()
    await dialog
      .getByRole('combobox', { name: 'Filter runs by action' })
      .click()
    await page
      .getByRole('option', { name: 'archived-action', exact: true })
      .click()
    await expect(dialog.getByText('No matching action runs.')).toBeVisible()
    await search.clear()
    await expect(bodyRows).toHaveCount(2)
    await dialog
      .getByRole('combobox', { name: 'Filter runs by action' })
      .click()
    await page.getByRole('option', { name: 'All actions', exact: true }).click()
    await expect(bodyRows).toHaveCount(10)
    await expect(pager.getByText('Page 1 of 2')).toBeVisible()
  } finally {
    await database.delete(actionRunTable).where(
      inArray(
        actionRunTable.id,
        rows.map((row) => row.id),
      ),
    )
  }
})

test('old administration links open the corresponding settings section or dialog', async ({
  page,
}) => {
  for (const section of ['cache', 'actions', 'collaborators']) {
    await page.goto(`${repository}/${section}`)
    await expect(page).toHaveURL(`${repository}/settings#${section}`)
    await expect(
      page.getByRole('heading', { name: 'Settings', exact: true }),
    ).toBeVisible()
  }
  await page.goto(`${repository}/configuration`)
  await expect(page).toHaveURL(/settings\?edit=configuration/)
  await expect(
    page.getByRole('textbox', { name: 'Pages CMS configuration' }),
  ).toBeVisible()
})
