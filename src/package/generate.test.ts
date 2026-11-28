import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { createPagesCmsServerServices } from '#/deployment/contracts/server.server'
import fixturePlugin from '../../tests/package/fixture/descriptor'
import { defineConfig, definePlugin } from './config'
import { generatePackageEntries } from './generate'
import type { PagesCmsClientDeployment } from '#/deployment/contracts/client'
import type { PagesCmsServerDeployment } from '#/deployment/contracts/server.server'

const SECRET = 'server-only-option-sentinel'
const PUBLIC = 'public-option-sentinel'
const directory = mkdtempSync(join(tmpdir(), 'pagescms-package-'))

afterAll(() => rmSync(directory, { recursive: true, force: true }))

function config(email = false) {
  return defineConfig({
    target: 'node',
    plugins: [
      fixturePlugin({
        options: { token: SECRET, email },
        publicOptions: { label: PUBLIC },
      }),
    ],
  })
}

async function load(name: string, source: string) {
  const path = join(directory, name)
  writeFileSync(path, source)
  return (await import(/* @vite-ignore */ path)) as { default: unknown }
}

describe('generatePackageEntries', () => {
  it('keeps server options and server modules out of the client entry', () => {
    const { server, client, shared } = generatePackageEntries(config())
    expect(server).toContain(SECRET)
    expect(server).toContain('fixture/server.ts')
    expect(server).not.toContain('fixture/shared.ts')
    expect(server).not.toContain('fixture/client.ts')
    expect(client).not.toContain(SECRET)
    expect(client).not.toContain('fixture/server.ts')
    expect(client).toContain(PUBLIC)
    expect(shared).toContain('fixture/shared.ts')
    expect(shared).not.toContain('fixture/client.ts')
    expect(shared).not.toContain(SECRET)
  })

  it('registers each plugin once per entry', () => {
    const { server, client } = generatePackageEntries(config())
    expect(server.match(/instantiateServerPlugin\("fixture"/g)).toHaveLength(1)
    expect(client.match(/instantiateClientPlugin\("fixture"/g)).toHaveLength(1)
  })

  it('omits entries for plugins without modules on that side', () => {
    const { server, client } = generatePackageEntries(
      defineConfig({
        target: 'cloudflare',
        plugins: [definePlugin({ id: 'server-only', server: '/x/server.js' })],
      }),
    )
    expect(server).toContain('"server-only"')
    expect(client).not.toContain('server-only')
  })

  it('rejects unsafe core prefixes', () => {
    expect(() =>
      generatePackageEntries(config(), { coreImportPrefix: 'x"/' }),
    ).toThrow(/prefix/)
  })

  it('builds working v5 deployments from the generated entries', async () => {
    const { server, client, shared } = generatePackageEntries(config())
    const serverDeployment = (await load('server.ts', server))
      .default as PagesCmsServerDeployment
    const clientDeployment = (await load('client.ts', client))
      .default as PagesCmsClientDeployment
    const sharedDeployment = (await load('shared.ts', shared))
      .default as PagesCmsClientDeployment

    expect(serverDeployment.apiVersion).toBe(5)
    expect(serverDeployment.plugins.map(({ id }) => id)).toEqual([
      'fixture',
      'pagescms-default-email',
    ])
    const services = createPagesCmsServerServices(serverDeployment, {
      FIXTURE: 'env',
    })
    const route = services.pluginRoutes['GET fixture/echo']
    const response = await route.handle(new Request('http://x'), {} as never)
    expect(await response.json()).toEqual({
      options: { token: SECRET, email: false },
      publicOptions: { label: PUBLIC },
      target: 'node',
      environment: { FIXTURE: 'env' },
    })

    const environment = { RESEND_API_KEY: 'key', RESEND_FROM_EMAIL: 'a@b.c' }
    expect(
      createPagesCmsServerServices(serverDeployment, environment).emailProvider,
    ).toBeDefined()
    const explicit = (
      await load('server-email.ts', generatePackageEntries(config(true)).server)
    ).default as PagesCmsServerDeployment
    // The fixture's provider wins; the fallback must not collide with it.
    expect(() =>
      createPagesCmsServerServices(explicit, environment),
    ).not.toThrow()

    expect(clientDeployment.apiVersion).toBe(5)
    const field = clientDeployment.fields['fixture-text']
    expect(field.definition).toMatchObject({ label: PUBLIC, defaultValue: '' })
    expect(typeof field.editor).toBe('function')
    expect(sharedDeployment.fields['fixture-text'].definition).toMatchObject({
      label: PUBLIC,
      defaultValue: '',
    })
    expect(sharedDeployment.fields['fixture-text'].editor).toBeUndefined()
  })
})
