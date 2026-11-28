import type { z as Zod } from 'zod'
import { describe, expect, it } from 'vitest'
import { definePagesCmsClientDeployment } from '#/deployment/contracts/client'
import { composeServerPlugins } from '#/plugins/compose.server'
import { instantiateClientPlugin } from './runtime'
import { instantiateServerPlugin, withDefaultEmail } from './runtime.server'
import type { ServerPlugin } from '#/plugins/server'

const context = { publicOptions: {}, target: 'node' as const }
const fallback = { send: async () => undefined }
const explicit = { send: async () => undefined }

function emailPlugin(id: string, supply: (environment: unknown) => boolean) {
  return {
    id,
    create: (environment: unknown) =>
      supply(environment) ? { emailProvider: explicit } : {},
  } satisfies ServerPlugin
}

describe('withDefaultEmail', () => {
  it('uses the fallback only when no plugin supplies a provider', () => {
    const plugins = withDefaultEmail(
      [emailPlugin('mail', (environment) => environment === 'explicit')],
      () => fallback,
    )
    expect(composeServerPlugins(plugins, 'explicit').emailProvider).toBe(
      explicit,
    )
    expect(composeServerPlugins(plugins, 'none').emailProvider).toBe(fallback)
    expect(composeServerPlugins(plugins, 'explicit').emailProvider).toBe(
      explicit,
    )
  })

  it('does not leak state from a failed composition', () => {
    let fail = true
    const plugins = withDefaultEmail(
      [
        emailPlugin('mail', () => true),
        {
          id: 'broken',
          create: () => {
            if (fail) throw new Error('boom')
            return {}
          },
        },
      ],
      () => fallback,
    )
    expect(() => composeServerPlugins(plugins, {})).toThrow('boom')
    fail = false
    expect(composeServerPlugins(plugins, {}).emailProvider).toBe(explicit)
    expect(
      composeServerPlugins(
        withDefaultEmail([], () => fallback),
        {},
      ).emailProvider,
    ).toBe(fallback)
  })

  it('registers nothing when the fallback is unconfigured', () => {
    const services = composeServerPlugins(withDefaultEmail([]), {})
    expect(services.emailProvider).toBeUndefined()
  })
})

describe('instantiateServerPlugin', () => {
  it('requires a factory returning the descriptor ID', () => {
    expect(() => instantiateServerPlugin('a', {}, {}, context)).toThrow(
      /default factory/,
    )
    expect(() =>
      instantiateServerPlugin(
        'a',
        () => ({ id: 'b', create: () => ({}) }),
        {},
        context,
      ),
    ).toThrow(/must return plugin a/)
  })
})

describe('instantiateClientPlugin', () => {
  const definition = { defaultValue: '' }
  const editor = async () => ({ default: () => null })

  it('combines shared definitions with lazy client components', () => {
    const plugin = instantiateClientPlugin(
      'chart',
      (options: { label: string }) => ({
        fields: {
          chart: { definition: { ...definition, label: options.label } },
        },
      }),
      () => ({ fields: { chart: { editor } } }),
      { label: 'Chart' },
    )
    const deployment = definePagesCmsClientDeployment({
      apiVersion: 5,
      plugins: [plugin],
    })
    expect(deployment.fields.chart.definition.label).toBe('Chart')
    expect(deployment.fields.chart.editor).toBe(editor)
  })

  it('retains shared configuration schema contributions in the deployment', () => {
    const configurationSchema = {
      media: {
        storage: {
          action: 'add' as const,
          schema: (z: typeof Zod) => z.string().optional(),
        },
      },
    }
    const plugin = instantiateClientPlugin(
      'storage',
      () => ({ configurationSchema }),
      undefined,
      {},
    )
    const deployment = definePagesCmsClientDeployment({
      apiVersion: 5,
      plugins: [plugin],
    })
    expect(deployment.plugins[0].configurationSchema).toBe(configurationSchema)
  })

  it('keeps shared-only and UI-only plugins valid', () => {
    expect(
      instantiateClientPlugin(
        'a',
        () => ({ fields: { a: { definition } } }),
        undefined,
        {},
      ).fields?.a.editor,
    ).toBeUndefined()
    expect(instantiateClientPlugin('b', undefined, () => ({}), {})).toEqual({
      id: 'b',
    })
  })

  it('rejects incoherent contributions', () => {
    expect(() =>
      instantiateClientPlugin(
        'a',
        undefined,
        () => ({ fields: { a: { editor } } }),
        {},
      ),
    ).toThrow(/no shared definition/)
    expect(() =>
      instantiateClientPlugin(
        'a',
        () => ({ fields: { a: { definition, editor } } }),
        undefined,
        {},
      ),
    ).toThrow(/Unknown shared field key editor/)
    expect(() =>
      instantiateClientPlugin('a', () => ({ routes: [] }), undefined, {}),
    ).toThrow(/Unknown shared contribution/)
    expect(() => instantiateClientPlugin('a', 'nope', undefined, {})).toThrow(
      /default factory/,
    )
  })
})

it('passes standalone pages through generated client plugin modules', () => {
  const page = {
    path: '/connect/consent',
    title: 'Consent',
    load: async () => ({ default: () => null }),
  }
  const plugin = instantiateClientPlugin(
    'test',
    undefined,
    () => ({ pages: { consent: page } }),
    {},
  )
  expect(plugin.pages?.consent).toBe(page)
  expect(
    definePagesCmsClientDeployment({ apiVersion: 5, plugins: [plugin] }).pages[
      'test/consent'
    ],
  ).toEqual(page)
})
