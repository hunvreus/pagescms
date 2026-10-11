import { expect, test } from './test'

const lineEnd = process.platform === 'darwin' ? 'Meta+ArrowRight' : 'End'

test('rich-text typing survives switching to source and back', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(
    '/pagescms/fixture/main/collection/posts/entry/content/posts/hello.md',
  )
  const editor = page.getByRole('textbox', { name: 'Body', exact: true })
  await expect(editor).toBeVisible()
  await editor.click()
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.type(' before-switch')
  await expect(editor).toContainText('before-switch')
  for (let index = 0; index < 2; index++) {
    await page.getByRole('tab', { name: 'Source', exact: true }).click()
    await expect(
      page.getByRole('textbox', { name: 'Body source', exact: true }),
    ).toContainText('before-switch')
    await page.getByRole('tab', { name: 'Editor', exact: true }).click()
    await editor.click()
    await page.keyboard.press('ControlOrMeta+End')
    await page.keyboard.type(` after-switch-${index}`)
    await expect(editor).toContainText(`after-switch-${index}`)
    await expect(editor).toContainText('before-switch')
  }
  expect(errors).toEqual([])
})

test('rich-text uploads retain permanent URLs when the preview fails', async ({
  page,
}) => {
  await page.goto(
    '/pagescms/fixture/main/collection/posts/entry/content/posts/hello.md',
  )
  const editor = page.getByRole('textbox', { name: 'Body', exact: true })
  await expect(editor).toBeVisible()
  await page.route('**/api/media-preview/**/preview-failure.PNG*', (route) =>
    route.abort(),
  )
  await editor.click()
  await editor.evaluate((element) => {
    const data = new DataTransfer()
    data.items.add(
      new File([new Uint8Array([137, 80, 78, 71])], 'preview-failure.PNG', {
        type: 'image/png',
      }),
    )
    const event = new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
    })
    Object.defineProperty(event, 'clipboardData', { value: data })
    element.dispatchEvent(event)
  })
  await expect(page.getByText('1 file uploaded', { exact: true })).toBeVisible()
  await expect(
    editor.locator('img[alt="preview-failure.PNG"]'),
  ).toHaveAttribute('src', /api\/media-preview/)
  await page.getByRole('tab', { name: 'Source', exact: true }).click()
  const source = page.getByRole('textbox', { name: 'Body source', exact: true })
  await expect(source).toContainText('/images/preview-failure.PNG')
  await expect(source).not.toContainText('blob:')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('File saved', { exact: true })).toBeVisible()
  await page.reload()
  await expect(editor).toBeVisible()
  await page.getByRole('tab', { name: 'Source', exact: true }).click()
  await expect(
    page.getByRole('textbox', { name: 'Body source', exact: true }),
  ).toContainText('/images/preview-failure.PNG')
})

test('failed rich-text uploads never enter the saved source as blob URLs', async ({
  page,
}) => {
  await page.goto(
    '/pagescms/fixture/main/collection/posts/entry/content/posts/hello.md',
  )
  const editor = page.getByRole('textbox', { name: 'Body', exact: true })
  await expect(editor).toBeVisible()
  await page.route('**/*', (route) =>
    route.request().method() === 'POST' ? route.abort() : route.continue(),
  )
  await editor.click()
  await editor.evaluate((element) => {
    const data = new DataTransfer()
    data.items.add(
      new File([new Uint8Array([137, 80, 78, 71])], 'failed.png', {
        type: 'image/png',
      }),
    )
    const event = new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
    })
    Object.defineProperty(event, 'clipboardData', { value: data })
    element.dispatchEvent(event)
  })
  await expect(
    page.getByText('0 of 1 files uploaded', { exact: true }),
  ).toBeVisible()
  await page.unroute('**/*')
  await page.getByRole('tab', { name: 'Source', exact: true }).click()
  const source = page.getByRole('textbox', { name: 'Body source', exact: true })
  await expect(source).not.toContainText('blob:')
  await expect(source).not.toContainText('failed.png')
  await expect(source).toContainText('Welcome to Pages CMS.')
})

test('configured HTML containers survive editing, saving and reopening', async ({
  page,
}) => {
  await page.goto(
    '/pagescms/fixture/main/collection/posts/entry/content/posts/hello.md',
  )
  await expect(
    page.getByRole('textbox', { name: 'Body', exact: true }),
  ).toBeVisible()
  await page.getByRole('tab', { name: 'Source', exact: true }).click()
  const source = page.getByRole('textbox', { name: 'Body source', exact: true })
  await source.fill(
    '<div class="callout"><h2>Title</h2><p>Description <strong>bold</strong></p><div class="legacy">Plain <em>text</em></div><p class="discard">Remove this</p><img src="/bad.png" onerror="window.editorAttack=1"></div>\n\n<!-- Saved comment -->\n\n<Badge text="New" />\n\nTail',
  )
  await page.getByRole('tab', { name: 'Editor', exact: true }).click()
  const editor = page.getByRole('textbox', { name: 'Body', exact: true })
  await expect(editor.locator('div.callout')).toHaveCount(1)
  await expect(editor).not.toContainText('Remove this')
  await expect(editor.locator('[onerror]')).toHaveCount(0)
  await editor.locator('h2').click()
  await page.keyboard.press(lineEnd)
  await page.keyboard.type(' edited')
  await page.getByRole('tab', { name: 'Source', exact: true }).click()
  await expect(source).toContainText(
    '<div class="callout"><h2>Title edited</h2>',
  )
  await expect(source).toContainText('<!-- Saved comment -->')
  await expect(source).toContainText('<Badge text="New" />')
  await expect(source).not.toContainText('onerror')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('File saved', { exact: true })).toBeVisible()
  await page.reload()
  await expect(editor.locator('div.callout h2')).toHaveText('Title edited')
  await expect(editor.locator('strong')).toHaveText('bold')
  await expect(editor.locator('[data-editor-html-source]')).toHaveCount(2)
  expect(
    await page.evaluate(
      () => (window as unknown as { editorAttack?: number }).editorAttack,
    ),
  ).toBeUndefined()
})

test('HTML-format fields save retained containers as HTML and reopen them', async ({
  page,
}) => {
  await page.goto('/pagescms/fixture/main/file/html-editor')
  const editor = page.getByRole('textbox', { name: 'HTML body', exact: true })
  await expect(editor.locator('div.callout h2')).toHaveText('HTML title')
  await editor.locator('h2').click()
  await page.keyboard.press(lineEnd)
  await page.keyboard.type(' edited')
  await page.getByRole('tab', { name: 'Source', exact: true }).click()
  const source = page.getByRole('textbox', {
    name: 'HTML body source',
    exact: true,
  })
  await expect(source).toContainText(
    '<div class="callout"><h2>HTML title edited</h2>',
  )
  await expect(source).not.toContainText('##')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('File saved', { exact: true })).toBeVisible()
  await page.reload()
  await expect(editor.locator('div.callout h2')).toHaveText('HTML title edited')
})

for (const format of ['markdown', 'html'] as const) {
  test(`${format} content survives three save/reopen cycles with nested formatting`, async ({
    page,
  }) => {
    test.setTimeout(90_000)
    const markdown = format === 'markdown'
    await page.goto(
      markdown
        ? '/pagescms/fixture/main/collection/posts/entry/content/posts/hello.md'
        : '/pagescms/fixture/main/file/html-editor',
    )
    const label = markdown ? 'Body' : 'HTML body'
    const editor = page.getByRole('textbox', { name: label, exact: true })
    await expect(editor).toBeVisible()
    await page.getByRole('tab', { name: 'Source', exact: true }).click()
    const source = page.getByRole('textbox', {
      name: `${label} source`,
      exact: true,
    })
    await source.fill(
      '<details><summary>More</summary><div class="callout" id="note"><h2>你好 &amp; café</h2><ul><li><p>First <strong>bold</strong></p><ul><li><p>Nested</p></li></ul></li></ul><p><a href="https://example.com">Link</a></p></div></details>\n\n<p>Tail</p>',
    )
    await page.getByRole('tab', { name: 'Editor', exact: true }).click()
    for (let cycle = 0; cycle < 3; cycle++) {
      await expect(editor.locator('h2')).toHaveText(
        '你好 & café' + ' edited'.repeat(cycle),
      )
      await expect(editor.locator('li li')).toHaveText('Nested')
      await expect(editor.locator('strong')).toHaveText('bold')
      await expect(editor.locator('a')).toHaveAttribute(
        'href',
        'https://example.com',
      )
      await editor.locator('h2').click()
      await page.keyboard.press(lineEnd)
      await page.keyboard.type(' edited')
      await page.getByRole('button', { name: 'Save', exact: true }).click()
      await expect(page.getByText('File saved', { exact: true })).toBeVisible()
      await page.reload()
      await expect(editor.locator('h2')).toHaveText(
        '你好 & café' + ' edited'.repeat(cycle + 1),
      )
    }
    await expect(editor.locator('#note')).toHaveCount(1)
    await page.getByRole('tab', { name: 'Source', exact: true }).click()
    await expect(source).toContainText('<details>')
    await expect(source).not.toContainText('open=')
  })
}

test('saving another field leaves Markdown body unchanged after source/visual switches', async ({
  page,
}) => {
  await page.goto(
    '/pagescms/fixture/main/collection/posts/entry/content/posts/hello.md',
  )
  const editor = page.getByRole('textbox', { name: 'Body', exact: true })
  await expect(editor).toBeVisible()
  await page.getByRole('tab', { name: 'Source', exact: true }).click()
  const source = page.getByRole('textbox', { name: 'Body source', exact: true })
  const original =
    '<div class="callout">\n\n**Exact spacing**\n\n</div>\n\n<!-- exact comment -->\n\n<Video id="abc" />\n'
  await source.fill(original)
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('File saved', { exact: true })).toBeVisible()
  await page.reload()
  await expect(editor).toBeVisible()
  for (let cycle = 0; cycle < 3; cycle++) {
    await page.getByRole('tab', { name: 'Source', exact: true }).click()
    await expect(source).toHaveValue(original)
    await page.getByRole('tab', { name: 'Editor', exact: true }).click()
  }
  await page.getByLabel('Title', { exact: true }).fill('Only the title changed')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('File saved', { exact: true })).toBeVisible()
  await page.reload()
  await expect(editor).toBeVisible()
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue(
    'Only the title changed',
  )
  await page.getByRole('tab', { name: 'Source', exact: true }).click()
  await expect(source).toHaveValue(original)
})

test('pasted HTML applies configured rules and remains safe after saving', async ({
  page,
}) => {
  await page.goto(
    '/pagescms/fixture/main/collection/posts/entry/content/posts/hello.md',
  )
  const editor = page.getByRole('textbox', { name: 'Body', exact: true })
  await expect(editor).toBeVisible()
  await editor.click()
  await page.keyboard.press('ControlOrMeta+End')
  await editor.evaluate((element) => {
    const data = new DataTransfer()
    data.setData(
      'text/html',
      '<div class="callout"><h2>Pasted title</h2><p>Safe <strong>bold</strong></p><div class="legacy">Plain <em>words</em></div><p class="discard">Delete this</p><a href="jav&#x61;script:window.attack=1">Link</a><img src="/bad.png" onerror="window.attack=1"><iframe srcdoc="<script>parent.attack=1</script>"></iframe></div>',
    )
    const event = new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
    })
    Object.defineProperty(event, 'clipboardData', { value: data })
    element.dispatchEvent(event)
  })
  await expect(editor.locator('h2')).toHaveText('Pasted title')
  await expect(editor).toContainText('Plain words')
  await expect(editor).not.toContainText('Delete this')
  await expect(editor.locator('em,[onerror],iframe,script')).toHaveCount(0)
  await page.getByRole('tab', { name: 'Source', exact: true }).click()
  const source = page.getByRole('textbox', { name: 'Body source', exact: true })
  await expect(source).not.toContainText(
    /onerror|javascript:|iframe|<script|legacy|Delete this/,
  )
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('File saved', { exact: true })).toBeVisible()
  await page.reload()
  await expect(editor.locator('h2')).toHaveText('Pasted title')
  expect(
    await page.evaluate(
      () => (window as unknown as { attack?: number }).attack,
    ),
  ).toBeUndefined()
})

for (const format of ['markdown', 'html'] as const) {
  test(`${format} keep strip drop rules persist through CMS save and reopen`, async ({
    page,
  }) => {
    const markdown = format === 'markdown'
    await page.goto(
      markdown
        ? '/pagescms/fixture/main/collection/posts/entry/content/posts/hello.md'
        : '/pagescms/fixture/main/file/html-editor',
    )
    const label = markdown ? 'Body' : 'HTML body'
    const editor = page.getByRole('textbox', { name: label, exact: true })
    await expect(editor).toBeVisible()
    await page.getByRole('tab', { name: 'Source', exact: true }).click()
    const source = page.getByRole('textbox', {
      name: `${label} source`,
      exact: true,
    })
    await source.fill(
      '<div class="callout"><h2>Retained title</h2><p>Description <strong>bold</strong></p><div class="legacy">Plain <em>words</em><span class="discard">Nested discarded</span></div><p class="discard">Discarded content</p></div>\n\n<p>Tail</p>',
    )
    await page.getByRole('tab', { name: 'Editor', exact: true }).click()
    await expect(editor.locator('div.callout')).toHaveCount(1)
    await expect(editor).toContainText('Plain words')
    await expect(editor.locator('em, .legacy, .discard')).toHaveCount(0)
    await expect(editor).not.toContainText(/Nested discarded|Discarded content/)
    await editor.locator('h2').click()
    await page.keyboard.press(lineEnd)
    await page.keyboard.type(' edited')
    await page.getByRole('tab', { name: 'Source', exact: true }).click()
    await expect(source).toContainText(
      '<div class="callout"><h2>Retained title edited</h2>',
    )
    await expect(source).toContainText('Plain words')
    await expect(source).not.toContainText(/legacy|discard|<em>/i)
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByText('File saved', { exact: true })).toBeVisible()
    await page.reload()
    await expect(editor.locator('div.callout h2')).toHaveText(
      'Retained title edited',
    )
    await expect(editor.locator('strong')).toHaveText('bold')
    await expect(editor).toContainText('Plain words')
    await expect(editor.locator('em, .legacy, .discard')).toHaveCount(0)
    await expect(editor).not.toContainText(/Nested discarded|Discarded content/)
  })
}
