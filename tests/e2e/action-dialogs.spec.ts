import { eq } from 'drizzle-orm'
import { createClient } from '@libsql/client'
import { createLibSqlDatabase } from '#/server/database/client.server'
import { actionRunTable } from '#/server/database/schema'
import { expect, test } from './test'

async function runs() {
  const url = process.env.E2E_DATABASE_URL
  if (!url) throw new Error('Isolated browser database is required')
  const client = createClient({ url })
  try {
    return await createLibSqlDatabase(client)
      .select()
      .from(actionRunTable)
      .where(eq(actionRunTable.repo, 'fixture'))
  } finally {
    client.close()
  }
}

test('content-page confirmation uses an alert dialog and restores focus', async ({
  page,
}) => {
  const nativeDialogs: string[] = []
  page.on('dialog', async (dialog) => {
    nativeDialogs.push(dialog.type())
    await dialog.dismiss()
  })
  await page.goto('/pagescms/fixture/main/file/groups')
  await page.waitForLoadState('networkidle')
  const trigger = page.getByRole('button', {
    name: 'Confirm workflow',
    exact: true,
  })
  await trigger.click()
  const dialog = page.getByRole('alertdialog', { name: 'Deploy site?' })
  await expect(dialog).toContainText(
    'This will trigger the deployment workflow.',
  )
  await expect(
    dialog.getByRole('button', { name: 'Deploy', exact: true }),
  ).toBeVisible()
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(trigger).toBeFocused()
  expect(await runs()).toHaveLength(0)
  await trigger.click()
  await dialog.getByRole('button', { name: 'Deploy', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect.poll(async () => (await runs()).length).toBe(1)
  expect(nativeDialogs).toEqual([])
})

test('action input dialog validates fields, retains values after failure, and submits typed inputs', async ({
  page,
}) => {
  await page.goto('/pagescms/fixture/main/file/groups')
  await page.waitForLoadState('networkidle')
  const trigger = page.getByRole('button', {
    name: 'Test action inputs',
    exact: true,
  })
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: 'Run input test?' })
  await expect(dialog).toContainText('Check the supplied inputs.')
  const submit = dialog.getByRole('button', { name: 'Start test', exact: true })
  await expect(submit.locator('svg')).toHaveCount(0)
  await expect(dialog.locator('[data-slot=field]')).toHaveCount(5)
  await submit.click()
  expect(await runs()).toHaveLength(0)
  await dialog.getByLabel('Action title').fill('Release')
  await submit.click()
  expect(await runs()).toHaveLength(0)
  await dialog.getByLabel('Action notes').fill('Ship it')
  await dialog.getByRole('combobox', { name: 'Environment' }).click()
  await page.getByRole('option', { name: 'Production', exact: true }).click()
  await dialog.getByLabel('Force').uncheck()
  await dialog.getByLabel('Count').fill('3')
  await page.route('**/_serverFn/**', (route) =>
    route.request().method() === 'POST' ? route.abort() : route.continue(),
  )
  await submit.click()
  await expect(dialog.getByText('Could not run action.')).toBeVisible()
  await expect(dialog.getByLabel('Action title')).toHaveValue('Release')
  await page.unroute('**/_serverFn/**')
  await submit.click()
  await expect(dialog).toHaveCount(0)
  await expect.poll(async () => (await runs()).length).toBe(1)
  expect((await runs())[0].payload).toMatchObject({
    inputs: {
      title: 'Release',
      notes: 'Ship it',
      environment: 'production',
      force: false,
      count: 3,
    },
  })
  await expect(trigger).toBeFocused()
})

test('confirm false still collects fields but dispatches immediately without fields', async ({
  page,
}) => {
  await page.goto('/pagescms/fixture/main/file/groups')
  await page.waitForLoadState('networkidle')
  await page
    .getByRole('button', { name: 'Inputs without confirmation', exact: true })
    .click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByLabel('Message')).toHaveValue('Hello')
  expect(await runs()).toHaveLength(0)
  await dialog
    .getByRole('button', { name: 'Inputs without confirmation', exact: true })
    .click()
  await expect(dialog).toHaveCount(0)
  await expect.poll(async () => (await runs()).length).toBe(1)
  expect((await runs())[0].payload).toMatchObject({
    inputs: { message: 'Hello' },
  })
  await page
    .getByRole('button', { name: 'Run immediately', exact: true })
    .click()
  await expect.poll(async () => (await runs()).length).toBe(2)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  expect(
    (await runs()).find((run) => run.actionName === 'immediate-test')?.payload,
  ).toMatchObject({ inputs: {} })
})
