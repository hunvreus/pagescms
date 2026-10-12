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

for (const format of ['markdown', 'html'] as const) {
  test(`${format} Basecoat alert snippets survive CMS save and reopen`, async ({
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
    await source.fill('')
    await page.getByRole('tab', { name: 'Editor', exact: true }).click()
    await editor.click()
    await page.keyboard.type('/alert')
    await page.getByRole('button', { name: 'Alert', exact: true }).click()
    await expect(editor.locator('div.alert > section > p')).toHaveText(
      'You can add components and dependencies to your app.',
    )
    await expect(
      editor.locator('div.alert > footer > p > a.btn'),
    ).toHaveAttribute('href', '/enable')
    await expect(editor.locator('div.alert > svg')).toHaveCount(1)
    await expect(editor.locator('svg')).toHaveAttribute('viewBox', '0 0 24 24')
    await editor
      .locator('h2')
      .click({ clickCount: 3, position: { x: 10, y: 10 } })
    await expect
      .poll(() =>
        editor.evaluate(() => window.getSelection()?.toString().trim()),
      )
      .toBe('Heads up!')
    await page.keyboard.type('Heads up! edited')
    await expect(editor.locator('h2')).toHaveText('Heads up! edited')
    const link = editor.locator('footer a')
    await link.click({ clickCount: 3 })
    await expect
      .poll(() => editor.evaluate(() => window.getSelection()?.toString()))
      .toBe('Enable')
    await page.keyboard.type('Enable now')
    await expect(link).toHaveText('Enable now')
    await link.click({ clickCount: 3 })
    await page.getByRole('button', { name: 'Link', exact: true }).click()
    await page
      .getByPlaceholder('https://example.com')
      .fill('https://example.com/changed')
    await page.getByRole('button', { name: 'Set link', exact: true }).click()
    await expect(link).toHaveAttribute('href', 'https://example.com/changed')
    await expect(link).toHaveAttribute('class', 'btn')
    await expect(link).toHaveAttribute('data-variant', 'outline')
    await page.getByRole('tab', { name: 'Source', exact: true }).click()
    await expect(source).toContainText('<h2>Heads up! edited</h2>')
    await expect(source).toContainText(
      '<section><p>You can add components and dependencies to your app.</p></section>',
    )
    await expect(source).toContainText(
      '<footer><p><a class="btn" data-variant="outline" href="https://example.com/changed">Enable now</a></p></footer>',
    )
    await expect(source).toContainText('<svg')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByText('File saved', { exact: true })).toBeVisible()
    await page.reload()
    await expect(editor.locator('div.alert > h2')).toHaveText(
      'Heads up! edited',
    )
    await expect(editor.locator('div.alert > section > p')).toHaveCount(1)
    await expect(editor.locator('footer a')).toHaveText('Enable now')
    await expect(editor.locator('footer a')).toHaveAttribute(
      'data-variant',
      'outline',
    )
    await expect(
      editor.locator('div.alert > footer > p > a.btn'),
    ).toHaveAttribute('href', 'https://example.com/changed')
    await expect(editor.locator('div.alert > svg')).toHaveCount(1)
    await expect(editor.locator('svg')).toHaveAttribute('viewBox', '0 0 24 24')
    await expect(editor.locator('svg path')).toHaveCount(2)
    await expect(editor.locator('svg path').last()).toHaveAttribute(
      'd',
      'M12 8h.01',
    )
    await expect(editor.locator('svg')).toHaveAttribute(
      'stroke-linecap',
      'round',
    )
    await expect(editor.locator('svg')).toHaveAttribute(
      'stroke-linejoin',
      'round',
    )
    await expect(editor.locator('footer a')).toHaveAttribute(
      'data-variant',
      'outline',
    )
  })
}

for (const format of ['markdown', 'html'] as const) {
  test(`${format} malicious SVG saved in source mode is inert when reopened`, async ({
    page,
  }) => {
    await page.addInitScript(() => {
      ;(window as unknown as { attacked: number }).attacked = 0
    })
    const externalRequests: string[] = []
    page.on('request', (request) => {
      if (request.url().startsWith('https://example.com/'))
        externalRequests.push(request.url())
    })
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
      '<div class="alert"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" onload="window.attacked++"><script>window.attacked++</script><foreignObject><img src="/bad" onerror="window.attacked++"/></foreignObject><use href="https://example.com/bad.svg#x"/><image href="https://example.com/bad.svg"/><animate attributeName="href" values="javascript:window.attacked++"/><path d="M12 16v-4" stroke="currentColor" fill="url(https://example.com/leak)" onclick="window.attacked++"/></svg><h2>Safe title</h2><section>Safe description</section><footer><a href="javascript:window.attacked++">Unsafe link</a></footer></div>',
    )
    // Save the attacker source directly, without visual editing sanitizing storage.
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByText('File saved', { exact: true })).toBeVisible()
    await page.reload()
    await expect(editor.locator('div.alert > svg path')).toHaveAttribute(
      'd',
      'M12 16v-4',
    )
    await expect(editor.locator('h2')).toHaveText('Safe title')
    await expect(
      editor.locator(
        'script, foreignObject, use, image, animate, [onload], [onclick], [onerror], [style], [href^="javascript:"]',
      ),
    ).toHaveCount(0)
    await expect(editor.locator('svg path')).not.toHaveAttribute('fill')
    expect(
      await page.evaluate(
        () => (window as unknown as { attacked: number }).attacked,
      ),
    ).toBe(0)
    expect(externalRequests).toEqual([])
    await page.getByRole('tab', { name: 'Source', exact: true }).click()
    // The unsafe source can remain stored while the editor renders only its safe form.
    await expect(source).toContainText('onload="window.attacked++"')
    expect(
      await page.evaluate(
        () => (window as unknown as { attacked: number }).attacked,
      ),
    ).toBe(0)
  })
}

for (const format of ['markdown', 'html']) {
  test(`${format} definition lists remain editable after CMS save and reopen`, async ({
    page,
  }) => {
    const markdown = format === 'markdown'
    await page.goto(
      markdown
        ? '/pagescms/fixture/main/collection/posts/entry/content/posts/hello.md'
        : '/pagescms/fixture/main/file/html-editor',
    )
    const editor = page.getByRole('textbox', {
      name: markdown ? 'Body' : 'HTML body',
      exact: true,
    })
    await expect(editor).toBeVisible()
    await page.getByRole('tab', { name: 'Source', exact: true }).click()
    const source = page.getByRole('textbox', {
      name: markdown ? 'Body source' : 'HTML body source',
      exact: true,
    })
    await source.fill(
      '<dl class="definitions"><dt>Timeout</dt><dd>Maximum wait.</dd><dt>Retry</dt><dd><p>Try again.</p><dl><dt>Nested</dt><dd>Nested description.</dd></dl></dd></dl>',
    )
    await page.getByRole('tab', { name: 'Editor', exact: true }).click()
    await expect(editor.locator('dl.definitions > dt')).toHaveCount(2)
    await expect(editor.locator('dl [contenteditable="false"]')).toHaveCount(0)
    await expect(editor.locator('dt').first()).toHaveCSS('font-weight', '500')
    await editor.locator('dt').first().click({ clickCount: 3 })
    await page.keyboard.type('Timeout edited')
    await editor.locator('dd > p').first().click({ clickCount: 3 })
    await page.keyboard.type('Description edited')
    await page.getByRole('tab', { name: 'Source', exact: true }).click()
    await expect(source).toContainText(
      '<dt>Timeout edited</dt><dd><p>Description edited</p></dd>',
    )
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByText('File saved', { exact: true })).toBeVisible()
    await page.reload()
    await expect(editor.locator('dl.definitions > dt').first()).toHaveText(
      'Timeout edited',
    )
    await expect(editor.locator('dd > p').first()).toHaveText(
      'Description edited',
    )
    await expect(editor.locator('dd > dl > dt')).toHaveText('Nested')
  })
}

for (const format of ['markdown', 'html']) {
  test(`${format} image links survive CMS save/reopen, URL/alt edits and removal`, async ({
    page,
  }) => {
    const markdown = format === 'markdown'
    await page.goto(
      markdown
        ? '/pagescms/fixture/main/collection/posts/entry/content/posts/hello.md'
        : '/pagescms/fixture/main/file/html-editor',
    )
    const editor = page.getByRole('textbox', {
      name: markdown ? 'Body' : 'HTML body',
      exact: true,
    })
    await expect(editor).toBeVisible()
    await page.getByRole('tab', { name: 'Source', exact: true }).click()
    const source = page.getByRole('textbox', {
      name: markdown ? 'Body source' : 'HTML body source',
      exact: true,
    })
    await source.fill(
      markdown ? '![Photo](/photo.png)' : '<img src="/photo.png" alt="Photo">',
    )
    await page.getByRole('tab', { name: 'Editor', exact: true }).click()
    const image = editor.locator('img')
    await image.click()
    await page.getByRole('button', { name: 'Link', exact: true }).click()
    await page.getByPlaceholder('https://example.com').fill('/target')
    await page.getByRole('button', { name: 'Set link', exact: true }).click()

    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByText('File saved', { exact: true })).toBeVisible()
    await page.reload()

    const url = page.url()
    await image.click()
    expect(page.url()).toBe(url)
    await page.getByRole('button', { name: 'Link', exact: true }).click()
    await expect(page.getByPlaceholder('https://example.com')).toHaveValue(
      '/target',
    )
    await page
      .getByPlaceholder('https://example.com')
      .fill('https://example.com/new')
    await page.getByRole('button', { name: 'Set link', exact: true }).click()
    await image.click()
    await page
      .getByRole('button', { name: 'Image alt text', exact: true })
      .click()
    await page.getByPlaceholder('Describe image').fill('Photo edited')
    await page
      .getByRole('button', { name: 'Save alt text', exact: true })
      .click()
    await page.getByRole('tab', { name: 'Source', exact: true }).click()
    await expect(source).toContainText(
      markdown
        ? '[![Photo edited](/photo.png)](https://example.com/new)'
        : '<a href="https://example.com/new"><img src="/photo.png" alt="Photo edited"></a>',
    )
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByText('File saved', { exact: true })).toBeVisible()
    await page.reload()
    await image.click()
    await page.getByRole('button', { name: 'Link', exact: true }).click()
    await expect(page.getByPlaceholder('https://example.com')).toHaveValue(
      'https://example.com/new',
    )
    await page.getByRole('button', { name: 'Link', exact: true }).click()
    await expect(image).toHaveAttribute('alt', 'Photo edited')
    await image.click()
    await page.getByRole('button', { name: 'Link', exact: true }).click()
    await page.getByRole('button', { name: 'Remove link', exact: true }).click()
    await expect(editor.locator('a')).toHaveCount(0)
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByText('File saved', { exact: true })).toBeVisible()
    await page.reload()
    await expect(editor.locator('a')).toHaveCount(0)
    await expect(image).toHaveAttribute('alt', 'Photo edited')
    await page.getByRole('tab', { name: 'Source', exact: true }).click()
    await expect(source).not.toContainText('https://example.com/new')
    await expect(source).toContainText('/photo.png')
  })
}

for (const format of ['html', 'markdown'] as const) {
  test(`${format} atomic HTML previews do not navigate and survive source editing/save/reopen`, async ({
    page,
  }) => {
    const markdown = format === 'markdown'
    await page.goto(
      markdown
        ? '/pagescms/fixture/main/collection/posts/entry/content/posts/hello.md'
        : '/pagescms/fixture/main/file/html-editor',
    )
    const editor = page.getByRole('textbox', {
      name: markdown ? 'Body' : 'HTML body',
      exact: true,
    })
    await expect(editor).toBeVisible()
    await page.getByRole('tab', { name: 'Source', exact: true }).click()
    const source = page.getByRole('textbox', {
      name: markdown ? 'Body source' : 'HTML body source',
      exact: true,
    })
    await source.fill(
      '<figure><a href="/should-not-navigate">Preview link</a></figure><p>Tail</p>',
    )
    await page.getByRole('tab', { name: 'Editor', exact: true }).click()
    const fragment = editor.locator('figure')
    await fragment.locator('a').click()
    await expect(fragment).toHaveClass(/ProseMirror-selectednode/)
    page.once('dialog', (dialog) =>
      dialog.accept('<figure><a href="/changed">Changed link</a></figure>'),
    )
    await fragment.locator('a').dblclick()
    await expect(fragment).toContainText('Changed link')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByText('File saved', { exact: true })).toBeVisible()
    await page.reload()
    await expect(editor.locator('figure a')).toHaveAttribute('href', '/changed')
    await editor.locator('figure a').click()
    await expect(editor.locator('figure')).toHaveClass(
      /ProseMirror-selectednode/,
    )
  })
}
