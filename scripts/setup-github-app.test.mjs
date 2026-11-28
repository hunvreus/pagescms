import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseEnv } from 'node:util'
import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

import {
  appCredentials,
  credentialDestination,
  formatCredentials,
  saveCredentials,
  applicationUrl,
  publicWebhookUrl,
  parseOptions,
  runLocalFlow,
  createManifest,
  setupSecrets,
  upsertEnv,
} from './setup-github-app.mjs'

describe('GitHub App setup', () => {
  it('starts a new environment from the example without retaining public placeholder secrets', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pagescms-app-'))
    try {
      const template = readFileSync(
        new URL('../.env.example', import.meta.url),
        'utf8',
      )
      const example = parseEnv(template)
      const secrets = setupSecrets(example, {}, example)
      expect(secrets.BETTER_AUTH_SECRET).not.toBe(example.BETTER_AUTH_SECRET)
      expect(Buffer.from(secrets.BETTER_AUTH_SECRET, 'base64url')).toHaveLength(
        32,
      )
      expect(Buffer.from(secrets.CRYPTO_KEY, 'base64')).toHaveLength(32)
      const path = join(directory, '.env.local')
      upsertEnv(path, { ...secrets, GITHUB_APP_ID: '42' }, template)
      const content = readFileSync(path, 'utf8')
      expect(content).toContain('# Repository cache policy')
      expect(parseEnv(content)).toMatchObject({
        ...example,
        ...secrets,
        GITHUB_APP_ID: '42',
      })
      expect(statSync(path).mode & 0o777).toBe(0o600)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('retains real secrets and existing local settings instead of replacing them from the example', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pagescms-app-'))
    const existing = {
      BETTER_AUTH_SECRET: 'a-real-auth-secret-that-must-remain-unchanged',
      CRYPTO_KEY: Buffer.alloc(32, 1).toString('base64'),
    }
    try {
      expect(
        setupSecrets(existing, {}, { BETTER_AUTH_SECRET: 'placeholder' }),
      ).toEqual(existing)
      expect(
        setupSecrets(existing, {
          BETTER_AUTH_SECRET: 'explicit-environment-override',
        }),
      ).toEqual({
        ...existing,
        BETTER_AUTH_SECRET: 'explicit-environment-override',
      })
      const path = join(directory, '.env.local')
      writeFileSync(
        path,
        '# Keep this comment\nDATABASE_URL="file:custom.db"\nCUSTOM_SETTING="preserved"\n',
      )
      upsertEnv(
        path,
        { ...existing, GITHUB_APP_ID: '42' },
        'DATABASE_URL="file:example.db"\n',
      )
      expect(parseEnv(readFileSync(path, 'utf8'))).toMatchObject({
        ...existing,
        DATABASE_URL: 'file:custom.db',
        CUSTOM_SETTING: 'preserved',
      })
      expect(readFileSync(path, 'utf8')).toContain('# Keep this comment')
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
  it('requests the core capabilities without build-status subscriptions or administration', () => {
    const manifest = createManifest({
      baseUrl: 'https://cms.example.com/',
      localCallbackUrl: 'http://127.0.0.1:8787/api/github-app/callback',
    })
    expect(manifest.default_permissions).toEqual({
      actions: 'write',
      contents: 'write',
      emails: 'read',
      metadata: 'read',
    })
    expect(manifest.default_events).toEqual([
      'installation_target',
      'repository',
      'push',
      'delete',
      'workflow_run',
    ])
    expect(manifest.callback_urls).toEqual([
      'https://cms.example.com/api/auth/callback/github',
    ])
    expect(manifest.hook_attributes).toEqual({
      url: 'https://cms.example.com/api/webhook/github',
      active: true,
    })
    expect(manifest.setup_url).toBe('https://cms.example.com/')
    expect(manifest.redirect_url).toBe(
      'http://127.0.0.1:8787/api/github-app/callback',
    )
  })

  it('rejects origins that would produce incorrect authentication or webhook URLs', () => {
    for (const baseUrl of [
      'file:///tmp/cms',
      'https://cms.example.com/path',
      'https://user:secret@cms.example.com',
      'https://cms.example.com/?foo=bar',
    ])
      expect(() => createManifest({ baseUrl })).toThrow('HTTP(S) origin')
  })

  it('saves GitHub-generated credentials, including its webhook secret and multiline private key', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pagescms-app-'))
    try {
      const path = join(directory, '.env.local')
      writeFileSync(
        path,
        '# Existing configuration\nBETTER_AUTH_SECRET="keep-me"\nGITHUB_APP_ID="old"\n',
      )
      const converted = {
        id: 42,
        slug: 'pagescms-test',
        client_id: 'test-id',
        client_secret: 'test-secret',
        pem: '-----BEGIN PRIVATE KEY-----\nexample\n-----END PRIVATE KEY-----\n',
        webhook_secret: 'github-generated-secret',
      }
      upsertEnv(path, appCredentials(converted))
      const env = parseEnv(readFileSync(path, 'utf8'))
      expect(env).toMatchObject({
        BETTER_AUTH_SECRET: 'keep-me',
        GITHUB_APP_ID: '42',
        GITHUB_APP_PRIVATE_KEY: converted.pem,
        GITHUB_APP_WEBHOOK_SECRET: converted.webhook_secret,
      })
      expect(readFileSync(path, 'utf8')).toContain('# Existing configuration')
      expect(statSync(path).mode & 0o777).toBe(0o600)
      expect(() =>
        appCredentials({ ...converted, webhook_secret: '' }),
      ).toThrow('webhook_secret')
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
  it('requires production HTTPS and a public webhook even for local applications', () => {
    expect(applicationUrl('cms.example.com')).toBe('https://cms.example.com')
    for (const baseUrl of [
      'http://cms.example.com',
      'http://localhost:3000',
      'https://127.0.0.1',
      'https://192.168.0.1',
      'https://[::1]',
      'https://cms.local',
    ])
      expect(() => createManifest({ baseUrl })).toThrow('Production needs')
    for (const webhookUrl of [
      'http://example.com/hook',
      'https://localhost/hook',
      'https://10.0.0.1/hook',
      'https://user:secret@example.com/hook',
    ])
      expect(() => publicWebhookUrl(webhookUrl)).toThrow('public HTTPS')
    expect(() =>
      createManifest({ mode: 'local', baseUrl: 'http://localhost:3000' }),
    ).toThrow('public HTTPS')
    const manifest = createManifest({
      mode: 'local',
      baseUrl: 'http://localhost:3000',
      webhookUrl: 'https://smee.io/channel',
    })
    expect(manifest.callback_urls[0]).toBe(
      'http://localhost:3000/api/auth/callback/github',
    )
    expect(manifest.hook_attributes.url).toBe('https://smee.io/channel')
    expect(manifest.default_permissions).not.toHaveProperty(
      'repository_creation',
    )
  })

  it('requests the documented administration permission only with template creation opted in', () => {
    const manifest = createManifest({
      baseUrl: 'https://cms.example.com',
      templates: true,
      publicApp: true,
    })
    expect(manifest.default_permissions.administration).toBe('write')
    expect(manifest.default_permissions).not.toHaveProperty(
      'repository_creation',
    )
    expect(manifest.public).toBe(true)
    expect(() => parseOptions(['--base-ur', 'example.com'])).toThrow()
    expect(() => parseOptions(['--base-url'])).toThrow()
  })

  it('previews without a browser or file writes and refuses silent localhost defaults', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pagescms-cli-'))
    const script = new URL('./setup-github-app.mjs', import.meta.url)
    try {
      const preview = spawnSync(
        process.execPath,
        [script.pathname, '--base-url', 'cms.example.com', '--dry-run'],
        { cwd: directory, encoding: 'utf8' },
      )
      expect(preview.status).toBe(0)
      expect(preview.stdout).toContain(
        'https://cms.example.com/api/webhook/github',
      )
      expect(preview.stdout).toContain('no files changed')
      expect(() =>
        readFileSync(join(directory, '.env.production.local')),
      ).toThrow()
      const missing = spawnSync(process.execPath, [script.pathname], {
        cwd: directory,
        encoding: 'utf8',
        env: { ...process.env, BETTER_AUTH_URL: 'http://localhost:3000' },
      })
      expect(missing.status).toBe(1)
      expect(missing.stdout + missing.stderr).toContain('Provide --base-url')
      const local = spawnSync(
        process.execPath,
        [
          script.pathname,
          '--mode',
          'local',
          '--base-url',
          'http://localhost:3000',
          '--dry-run',
        ],
        { cwd: directory, encoding: 'utf8' },
      )
      expect(local.status).toBe(1)
      expect(local.stdout + local.stderr).toContain('public HTTPS tunnel')
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('protects the browser handoff and accepts only the matching callback state', async () => {
    let ready
    const started = new Promise((resolve) => {
      ready = resolve
    })
    const flow = runLocalFlow({
      host: '127.0.0.1',
      port: 0,
      state: 'test-state',
      appCreationUrl: 'https://github.com/settings/apps/new',
      manifest: createManifest({ baseUrl: 'https://cms.example.com' }),
      autoOpen: false,
      onReady: ready,
      timeoutMs: 3000,
    })
    const launch = await started
    const origin = new URL(launch).origin
    expect((await fetch(`${origin}/start`)).status).toBe(404)
    const start = await fetch(launch)
    expect(start.headers.get('cache-control')).toBe('no-store')
    expect(await start.text()).toContain(
      'https://cms.example.com/api/webhook/github',
    )
    expect(
      (await fetch(`${origin}/api/github-app/callback?state=wrong&code=wrong`))
        .status,
    ).toBe(400)
    expect(
      (
        await fetch(
          `${origin}/api/github-app/callback?state=test-state&code=temporary`,
        )
      ).status,
    ).toBe(200)
    await expect(flow).resolves.toBe('temporary')
  })
  it('requires explicit permission for every existing env file, even without App credentials and with --yes', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'pagescms-cli-'))
    try {
      const env = join(directory, '.env.local')
      writeFileSync(env, 'DATABASE_URL="file:keep.db"\n')
      await expect(
        credentialDestination({ env, yes: true }, false, 'local'),
      ).rejects.toThrow('env file already exists')
      const destination = await credentialDestination(
        { env, overwrite: true },
        false,
        'local',
      )
      saveCredentials(destination, { GITHUB_APP_ID: '42' })
      expect(parseEnv(readFileSync(env, 'utf8'))).toEqual({
        DATABASE_URL: 'file:keep.db',
        GITHUB_APP_ID: '42',
      })
      const changed = await credentialDestination(
        { env, overwrite: true },
        false,
        'local',
      )
      writeFileSync(env, 'DATABASE_URL="file:edited.db"\n')
      expect(() => saveCredentials(changed, { GITHUB_APP_ID: '43' })).toThrow(
        'changed during setup',
      )
      expect(parseEnv(readFileSync(env, 'utf8'))).toEqual({
        DATABASE_URL: 'file:edited.db',
      })
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('offers copyable terminal output without reading or creating a credential file', async () => {
    const destination = await credentialDestination(
      { output: 'terminal' },
      false,
      'production',
    )
    expect(destination).toEqual({
      output: 'terminal',
      envPath: null,
      existing: {},
      source: null,
    })
    const credentials = {
      GITHUB_APP_PRIVATE_KEY:
        '-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----',
      GITHUB_APP_CLIENT_SECRET: 'fake-secret',
    }
    expect(parseEnv(formatCredentials(credentials))).toEqual(credentials)
    await expect(
      credentialDestination(
        { output: 'terminal', env: '.env.local' },
        false,
        'local',
      ),
    ).rejects.toThrow('apply only to file output')
    await expect(
      credentialDestination({ output: 'invalid' }, false, 'local'),
    ).rejects.toThrow('--output must be')
  })

  it('replaces literal multiline and duplicate declarations while preserving unrelated values', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pagescms-cli-'))
    try {
      const env = join(directory, '.env.local')
      writeFileSync(
        env,
        '# Keep this comment\nexport GITHUB_APP_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nold\n-----END PRIVATE KEY-----"\nGITHUB_APP_ID=old\nGITHUB_APP_ID=also-old\nCUSTOM_VALUE="untouched"\n',
      )
      const values = { GITHUB_APP_PRIVATE_KEY: 'new\nkey', GITHUB_APP_ID: '42' }
      upsertEnv(env, values)
      const content = readFileSync(env, 'utf8')
      expect(parseEnv(content)).toEqual({
        ...values,
        CUSTOM_VALUE: 'untouched',
      })
      expect(content).toContain('# Keep this comment')
      expect(content).not.toContain('old')
      expect(content).toContain('export GITHUB_APP_PRIVATE_KEY=')
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
