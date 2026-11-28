import { setupI18n } from '@lingui/core'
import { describe, expect, it, vi } from 'vitest'
import { loadPluginCatalogs } from './plugin-catalogs'
import { isUiMessage, translateMessage } from './message'
import { definePagesCmsClientDeployment } from '#/deployment/contracts/client'
import { DEPLOYMENT_API_VERSION } from '#/deployment/contracts/version'
import { instantiateClientPlugin } from '#/package/runtime'
import type { ClientPlugin } from '#/plugins/client'

const moduleFor = (messages: Record<string, string[]>) => async () => ({
  messages,
})
describe('plugin-owned catalogs', () => {
  it('combines catalogs, preserving English fallbacks without overriding core', async () => {
    const plugins: ClientPlugin[] = [
      {
        id: 'billing',
        translations: {
          en: moduleFor({
            'billing.title': ['Billing'],
            'billing.cancel': ['Cancel'],
          }),
          fr: moduleFor({ 'billing.title': ['Facturation'] }),
        },
      },
      {
        id: 'custom',
        translations: { en: moduleFor({ 'custom.title': ['Custom'] }) },
      },
    ]
    const messages = await loadPluginCatalogs(plugins, 'fr', { core: ['Core'] })
    const i18n = setupI18n({ locale: 'fr', messages: { fr: messages } })
    expect(i18n._('billing.title')).toBe('Facturation')
    expect(i18n._('billing.cancel')).toBe('Cancel')
    expect(i18n._('custom.title')).toBe('Custom')
    expect(i18n._('core')).toBe('Core')
    expect(translateMessage(i18n, { id: 'billing.title' })).toBe('Facturation')
    expect(translateMessage(i18n, 'Repository label')).toBe('Repository label')
  })
  it('does not load another locale when English is selected', async () => {
    const en = vi.fn(moduleFor({ 'one.title': ['One'] }))
    const fr = vi.fn(moduleFor({ 'one.title': ['Un'] }))
    await loadPluginCatalogs(
      [{ id: 'one', translations: { en, fr } }],
      'en',
      {},
    )
    expect(en).toHaveBeenCalledOnce()
    expect(fr).not.toHaveBeenCalled()
  })
  it('rejects namespace violations and collisions with core', async () => {
    for (const id of ['core', 'other.title', 'one.', 'one.title']) {
      await expect(
        loadPluginCatalogs(
          [
            {
              id: 'one',
              translations: { en: moduleFor({ [id]: ['Overwrite'] }) },
            },
          ],
          'en',
          { 'one.title': ['Core'] },
        ),
      ).rejects.toThrow('Invalid translation ID')
    }
  })
  it('propagates a catalog failure before callers activate any partial language', async () => {
    await expect(
      loadPluginCatalogs(
        [
          {
            id: 'one',
            translations: {
              en: moduleFor({ 'one.title': ['One'] }),
              fr: async () => {
                throw new Error('offline')
              },
            },
          },
        ],
        'fr',
        {},
      ),
    ).rejects.toThrow('offline')
  })
  it('validates registration and retains loaders through package instantiation', () => {
    const translations = { en: moduleFor({ 'one.title': ['One'] }) }
    const plugin = instantiateClientPlugin(
      'one',
      undefined,
      () => ({
        translations,
        repositoryPages: {
          settings: {
            label: { id: 'one.title', message: 'One' },
            load: async () => ({ default: () => null }),
          },
        },
      }),
      {},
    )
    expect(
      definePagesCmsClientDeployment({
        apiVersion: DEPLOYMENT_API_VERSION,
        plugins: [plugin],
      }).plugins[0].translations,
    ).toBe(translations)
    for (const invalid of [
      {},
      { fr: translations.en },
      { en: 'bad' },
      { en: translations.en, '../fr': translations.en },
    ])
      expect(() =>
        definePagesCmsClientDeployment({
          apiVersion: DEPLOYMENT_API_VERSION,
          plugins: [{ id: 'one', translations: invalid as never }],
        }),
      ).toThrow('Invalid translations')
    expect(isUiMessage({ id: 'other.title', message: 'Wrong' }, 'one')).toBe(
      false,
    )
  })
})

it('rejects broken selected loaders and invalid message values', async () => {
  for (const broken of [
    undefined,
    null,
    { messages: { 'one.title': 42 } },
    { messages: { 'one.title': [{}] } },
  ]) {
    const plugin = {
      id: 'one',
      translations: {
        en: moduleFor({ 'one.title': ['One'] }),
        fr: async () => broken,
      },
    } as unknown as ClientPlugin
    await expect(loadPluginCatalogs([plugin], 'fr', {})).rejects.toThrow(
      'Invalid translation',
    )
  }
})
it('uses English for empty translations and rejects missing registered English labels', async () => {
  const plugin: ClientPlugin = {
    id: 'one',
    translations: {
      en: moduleFor({ 'one.title': ['One'], 'one.empty': ['Fallback'] }),
      fr: moduleFor({ 'one.title': [''], 'one.empty': [] }),
    },
  }
  expect(await loadPluginCatalogs([plugin], 'fr', {})).toEqual({
    'one.title': ['One'],
    'one.empty': ['Fallback'],
  })
  plugin.repositoryPages = {
    settings: {
      label: { id: 'one.missing' },
      load: async () => ({ default: () => null }),
    },
  }
  await expect(loadPluginCatalogs([plugin], 'fr', {})).rejects.toThrow(
    'Missing English translation',
  )
})

it('rejects invalid package translation registrations instead of dropping them', () => {
  for (const translations of [null, 0, '']) {
    const plugin = instantiateClientPlugin(
      'one',
      undefined,
      () => ({ translations }),
      {},
    )
    expect(() =>
      definePagesCmsClientDeployment({
        apiVersion: DEPLOYMENT_API_VERSION,
        plugins: [plugin],
      }),
    ).toThrow('Invalid translations')
  }
})
