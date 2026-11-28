import { TestI18n } from '#/i18n/test-provider'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { ConfigurationSetup } from './configuration-setup'

it('offers manual setup and documentation in one titled neutral alert', () => {
  const html = renderToStaticMarkup(
    <TestI18n>{<ConfigurationSetup />}</TestI18n>,
  )
  expect(html).toContain('Configure your project')
  expect(html).toContain('data-slot="alert-title"')
  expect(html).toContain('https://pagescms.org/docs/configuration/')
  expect(html).toContain('Read the docs')
  expect(html).toContain('Save a configuration file')
  expect(html).toContain('.pages.yml')
  expect(html).not.toContain('Auto-configure')
  const description = html.match(
    /data-slot="alert-description"[\s\S]*?<\/div>/,
  )?.[0]
  expect(description).toBeDefined()
  expect(description).not.toContain('<a')
})
