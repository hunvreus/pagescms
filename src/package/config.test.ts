import { describe, expect, it } from 'vitest'
import { defineConfig, definePlugin } from './config'

const root = '/plugins/example'

describe('definePlugin', () => {
  it('normalizes file URLs and freezes JSON options', () => {
    const plugin = definePlugin({
      id: 'example',
      server: new URL('file:///plugins/example/server.js'),
      client: `${root}/client.js`,
      options: { nested: { list: [1, 'two', true, null] } },
    })
    expect(plugin).toMatchObject({
      server: `${root}/server.js`,
      client: `${root}/client.js`,
      targets: ['node', 'cloudflare'],
      publicOptions: {},
    })
    expect(Object.isFrozen(plugin.options.nested)).toBe(true)
  })

  it('copies options so later mutation cannot leak into the build', () => {
    const options = { region: 'eu' }
    const plugin = definePlugin({ id: 'example', server: root, options })
    options.region = 'us'
    expect(plugin.options).toEqual({ region: 'eu' })
  })

  it.each([
    ['function', { fn: () => undefined }],
    ['undefined', { value: undefined }],
    ['date', { value: new Date() }],
    ['map', { value: new Map() }],
    ['NaN', { value: Number.NaN }],
    ['infinity', { value: Number.POSITIVE_INFINITY }],
    ['bigint', { value: 1n }],
    ['symbol', { value: Symbol('x') }],
    // eslint-disable-next-line no-sparse-arrays
    ['sparse array', { value: [1, , 3] }],
    ['class instance', { value: new (class Secret {})() }],
  ])('rejects non-JSON option values (%s)', (_, options) => {
    expect(() =>
      definePlugin({ id: 'example', server: root, options: options as never }),
    ).toThrow(/options/)
    expect(() =>
      definePlugin({
        id: 'example',
        client: root,
        publicOptions: options as never,
      }),
    ).toThrow(/publicOptions/)
  })

  it('rejects circular and non-object options', () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    expect(() =>
      definePlugin({ id: 'example', server: root, options: circular as never }),
    ).toThrow(/circular/)
    expect(() =>
      definePlugin({ id: 'example', server: root, options: [] as never }),
    ).toThrow(/JSON object/)
  })

  it('rejects invalid descriptors', () => {
    expect(() => definePlugin({ id: 'Bad', server: root })).toThrow(/ID/)
    expect(() =>
      definePlugin({ id: 'pagescms-default-email', server: root }),
    ).toThrow(/reserved/)
    expect(() => definePlugin({ id: 'example' })).toThrow(/must provide/)
    expect(() =>
      definePlugin({ id: 'example', server: 'relative/server.js' }),
    ).toThrow(/absolute/)
    expect(() =>
      definePlugin({
        id: 'example',
        server: new URL('https://example.com/server.js'),
      }),
    ).toThrow(/file: URL/)
    expect(() =>
      definePlugin({ id: 'example', server: root, extra: 1 } as never),
    ).toThrow(/Unknown key/)
    expect(() =>
      definePlugin({ id: 'example', server: root, targets: ['deno'] as never }),
    ).toThrow(/targets/)
    expect(() =>
      definePlugin({ id: 'example', server: root, targets: [] }),
    ).toThrow(/targets/)
  })

  it('normalizes an optional migrations directory', () => {
    expect(definePlugin({ id: 'example', server: root })).not.toHaveProperty(
      'migrations',
    )
    expect(
      definePlugin({
        id: 'example',
        server: root,
        migrations: new URL('file:///plugins/example/drizzle'),
      }).migrations,
    ).toBe(`${root}/drizzle`)
    expect(() =>
      definePlugin({ id: 'example', server: root, migrations: 'drizzle' }),
    ).toThrow(/migrations must be an absolute/)
    expect(() =>
      definePlugin({ id: 'core', server: root, migrations: root }),
    ).toThrow(/core cannot declare migrations/)
  })
})

describe('defineConfig', () => {
  const plugin = definePlugin({ id: 'example', server: root })

  it('accepts an explicit registration array', () => {
    const config = defineConfig({ target: 'cloudflare', plugins: [plugin] })
    expect(config.plugins.map(({ id }) => id)).toEqual(['example'])
    expect(defineConfig({ target: 'node' }).plugins).toEqual([])
  })

  it('rejects duplicate plugins, unsupported targets and unknown keys', () => {
    expect(() =>
      defineConfig({ target: 'node', plugins: [plugin, plugin] }),
    ).toThrow(/Duplicate plugin: example/)
    expect(() => defineConfig({ target: 'deno' as never })).toThrow(
      /Unsupported target/,
    )
    expect(() =>
      defineConfig({
        target: 'cloudflare',
        plugins: [
          definePlugin({ id: 'smtp', server: root, targets: ['node'] }),
        ],
      }),
    ).toThrow(/does not support target cloudflare/)
    expect(() =>
      defineConfig({ target: 'node', discover: true } as never),
    ).toThrow(/Unknown configuration key/)
    expect(() =>
      defineConfig({ target: 'node', plugins: {} as never }),
    ).toThrow(/array/)
  })

  it('revalidates hand-written descriptors', () => {
    expect(() =>
      defineConfig({
        target: 'node',
        plugins: [{ ...plugin, options: { fn: () => 1 } } as never],
      }),
    ).toThrow(/JSON/)
  })
})
