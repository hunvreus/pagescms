import { createClient } from '@libsql/client'
import { expect, test } from './test'

const overview = '/github/pagescms/fixture/main'

test.setTimeout(60_000)

test('saving configuration enables Overview without requiring collaborators', async ({
  page,
}) => {
  await page.goto('/github/pagescms/fixture/unconfigured')
  await expect(
    page.getByRole('link', { name: 'Overview', exact: true }),
  ).toBeVisible()
  await page
    .getByRole('region', { name: 'Repository setup', exact: true })
    .getByRole('link', { name: 'Configure' })
    .click()
  const setup = page.getByRole('region', {
    name: 'Configuration setup',
    exact: true,
  })
  await expect(setup).toBeVisible()
  await expect(
    setup.getByRole('link', { name: 'Read the docs' }),
  ).toHaveAttribute('href', 'https://pagescms.org/docs/configuration/')
  await expect(setup.getByRole('link', { name: 'Read the docs' })).toHaveCSS(
    'text-decoration-line',
    'none',
  )
  await page.getByRole('link', { name: 'Overview', exact: true }).click()
  await expect(
    page.getByRole('region', { name: 'Repository setup', exact: true }),
  ).toBeVisible()
  await page.getByRole('link', { name: 'Configure', exact: true }).click()
  const editor = page.getByRole('textbox', { name: 'Configuration' })
  await expect(editor).toHaveAttribute('contenteditable', 'true')
  await editor.fill(
    'content:\n  - name: posts\n    type: collection\n    path: content/posts\n',
  )
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(setup).toBeHidden()
  await expect(
    page.getByRole('button', { name: 'Save', exact: true }),
  ).toBeDisabled()
  await page.getByRole('link', { name: 'Overview', exact: true }).click()
  await expect(
    page.getByRole('region', { name: 'Quick links', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('region', { name: 'Repository setup checklist' }),
  ).toHaveCount(0)
})

test('unconfigured branches keep Overview accessible and preserve drafts', async ({
  page,
}) => {
  const database = createClient({ url: process.env.E2E_DATABASE_URL! })
  try {
    await database.execute({
      sql: `insert into activity (repository_id, id, source, owner, repo, branch, kind, area, resource, path, actor, origin, occurred_at) values ((select id from repository where source = 'github.com' and external_id = '1'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        'previous-configuration',
        'github.com',
        'pagescms',
        'fixture',
        'unconfigured',
        'deleted',
        'configuration',
        '',
        '.pages.yml',
        'Maya Chen',
        'webhook',
        Date.now(),
      ],
    })
  } finally {
    database.close()
  }
  await page.goto('/github/pagescms/fixture/unconfigured/configuration')
  const editor = page.getByRole('textbox', { name: 'Configuration' })
  await expect(editor).toHaveAttribute('contenteditable', 'true')
  await editor.fill('content: []')
  await expect(
    page.getByRole('button', { name: /^Local draft:/ }),
  ).toBeVisible()
  await page.goto('/github/pagescms/fixture/unconfigured')
  await expect(
    page.getByRole('region', { name: 'Recently visited and drafts' }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('list', { name: 'Activity', exact: true }),
  ).toHaveCount(0)
  await page
    .getByRole('region', { name: 'Repository setup', exact: true })
    .getByRole('link', { name: 'Configure' })
    .click()
  await expect(editor).toContainText('content: []')
})

test('Overview actions dispatch with repository context', async ({ page }) => {
  await page.goto(overview)
  await expect(
    page.getByText('Entries you visit will appear here.', { exact: true }),
  ).toBeVisible()
  const action = page
    .getByRole('region', { name: 'Quick links', exact: true })
    .getByRole('button', { name: 'Run Deploy site', exact: true })
  await action.hover()
  await expect(page.getByRole('tooltip')).toHaveText('Run Deploy site')
  await action.click()
  const confirmation = page.getByRole('alertdialog', { name: 'Deploy site?' })
  await expect(confirmation).toBeVisible()
  await confirmation
    .getByRole('button', { name: 'Deploy', exact: true })
    .click()
  await expect(confirmation).toBeHidden()
  const database = createClient({ url: process.env.E2E_DATABASE_URL! })
  try {
    const row = await database.execute(
      'select payload, context_type, context_name, context_path from action_run order by id desc limit 1',
    )
    expect(row.rows).toHaveLength(1)
    expect(row.rows[0].context_type).toBe('repository')
    expect(row.rows[0].context_name).toBeNull()
    expect(row.rows[0].context_path).toBeNull()
    expect(JSON.parse(String(row.rows[0].payload)).context).toEqual({
      type: 'repository',
      name: null,
      path: null,
      data: {},
    })
  } finally {
    database.close()
  }
})
