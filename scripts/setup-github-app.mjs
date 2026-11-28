#!/usr/bin/env node
import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'
import { execFile } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs, parseEnv } from 'node:util'
import { BlockList, isIP } from 'node:net'
import * as prompts from '@clack/prompts'

const cancelled = new Error('Setup cancelled.')

async function answer(promise) {
  const value = await promise
  if (prompts.isCancel(value)) throw cancelled
  return value
}

export function parseOptions(argv) {
  return parseArgs({
    args: argv,
    options: {
      help: { type: 'boolean', short: 'h' },
      mode: { type: 'string' },
      'base-url': { type: 'string' },
      'webhook-url': { type: 'string' },
      'app-name': { type: 'string' },
      'owner-type': { type: 'string' },
      org: { type: 'string' },
      port: { type: 'string' },
      env: { type: 'string' },
      output: { type: 'string' },
      overwrite: { type: 'boolean' },
      templates: { type: 'boolean' },
      public: { type: 'boolean' },
      'no-open': { type: 'boolean' },
      'dry-run': { type: 'boolean' },
      yes: { type: 'boolean', short: 'y' },
    },
  }).values
}

const privateAddresses = new BlockList()
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 3],
])
  privateAddresses.addSubnet(network, prefix, 'ipv4')
for (const [network, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
])
  privateAddresses.addSubnet(network, prefix, 'ipv6')

function isPublicHost(host) {
  host = host.replace(/^\[|\]$/g, '').toLowerCase()
  const version = isIP(host)
  if (version)
    return !privateAddresses.check(host, version === 4 ? 'ipv4' : 'ipv6')
  return (
    host.includes('.') &&
    !/(^|\.)(localhost|local|internal|test|invalid)$/.test(host)
  )
}

export function applicationUrl(value, mode = 'production') {
  let url
  try {
    url = new URL(value.includes('://') ? value : `https://${value}`)
  } catch {
    throw new Error('Enter an HTTP(S) origin, such as https://cms.example.com.')
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  )
    throw new Error(
      'Enter an HTTP(S) origin without a path, query or credentials.',
    )
  if (
    mode === 'production' &&
    (url.protocol !== 'https:' || !isPublicHost(url.hostname))
  )
    throw new Error(
      'Production needs a public HTTPS URL. Choose local development for localhost.',
    )
  return url.origin
}

export function publicWebhookUrl(value) {
  let url
  try {
    url = new URL(value)
  } catch {
    throw new Error('Enter a full public HTTPS webhook URL.')
  }
  if (
    url.protocol !== 'https:' ||
    !isPublicHost(url.hostname) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error(
      'GitHub needs a public HTTPS webhook URL; localhost and private addresses cannot receive webhooks.',
    )
  return url.href
}

function validation(parse) {
  return (value) => {
    if (!value?.trim()) return 'Enter a value.'
    try {
      parse(value.trim())
    } catch (error) {
      return error.message
    }
  }
}

export function createManifest({
  baseUrl,
  appName = 'Pages CMS',
  localCallbackUrl,
  mode = 'production',
  webhookUrl,
  templates = false,
  publicApp = false,
}) {
  if (!['production', 'local'].includes(mode))
    throw new Error('Mode must be production or local.')
  baseUrl = applicationUrl(baseUrl, mode)
  if (!appName.trim() || appName.length > 34)
    throw new Error('App name must contain between 1 and 34 characters.')
  webhookUrl = publicWebhookUrl(webhookUrl ?? `${baseUrl}/api/webhook/github`)
  return {
    name: appName.trim(),
    url: baseUrl,
    callback_urls: [`${baseUrl}/api/auth/callback/github`],
    redirect_url: localCallbackUrl,
    description:
      'An open source CMS for editing content in GitHub repositories.',
    public: publicApp,
    default_permissions: {
      // GitHub's manifest endpoint rejects repository_creation. Administration
      // is the documented template-creation grant and requires explicit opt-in.
      ...(templates ? { administration: 'write' } : {}),
      actions: 'write',
      contents: 'write',
      emails: 'read',
      metadata: 'read',
    },
    default_events: [
      'installation_target',
      'repository',
      'push',
      'delete',
      'workflow_run',
    ],
    request_oauth_on_install: false,
    setup_on_update: true,
    setup_url: `${baseUrl}/`,
    hook_attributes: { url: webhookUrl, active: true },
  }
}

export async function credentialDestination(args, interactive, mode) {
  let output = args.output
  if (output && !['file', 'terminal'].includes(output))
    throw new Error('--output must be file or terminal.')
  if (!output && interactive && !args.yes)
    output = await answer(
      prompts.select({
        message: 'How would you like to keep the credentials?',
        initialValue: 'file',
        options: [
          { value: 'file', label: 'Save to an env file', hint: 'recommended' },
          {
            value: 'terminal',
            label: 'Show values for manual setup',
            hint: 'secrets will be visible in the terminal',
          },
        ],
      }),
    )
  output ??= 'file'
  if (output === 'terminal') {
    if (args.env || args.overwrite)
      throw new Error('--env and --overwrite apply only to file output.')
    return { output, envPath: null, existing: {}, source: null }
  }
  let path = args.env
  const defaultPath = mode === 'local' ? '.env.local' : '.env.production.local'
  if (!path && interactive && !args.yes)
    path = await answer(
      prompts.text({
        message: 'Env file location',
        initialValue: defaultPath,
        validate: (value) =>
          !value?.trim() ? 'Enter a file path.' : undefined,
      }),
    )
  const envPath = resolve(path || defaultPath)
  const source = existsSync(envPath) ? readFileSync(envPath, 'utf8') : null
  if (source !== null && !args.overwrite && !args['dry-run']) {
    if (!interactive || args.yes)
      throw new Error(
        'The env file already exists. Review it and use --overwrite to update managed keys, or choose --output terminal. --yes does not authorize an existing-file update.',
      )
    prompts.log.info(
      `Existing file: ${envPath}\nOnly managed GitHub App values and the application URL will be updated. Other settings and real authentication/encryption keys are retained.`,
    )
    if (
      !(await answer(
        prompts.confirm({
          message: 'Update this existing file?',
          initialValue: false,
        }),
      ))
    )
      throw cancelled
  }
  return {
    output,
    envPath,
    existing: source === null ? {} : parseEnv(source),
    source,
  }
}

export function formatCredentials(values) {
  return (
    Object.entries(values)
      .map(([key, value]) => `${key}=${JSON.stringify(String(value ?? ''))}`)
      .join('\n') + '\n'
  )
}

export function saveCredentials(destination, values, template = '') {
  const current = existsSync(destination.envPath)
    ? readFileSync(destination.envPath, 'utf8')
    : null
  if (current !== destination.source)
    throw new Error(
      'The env file changed during setup; it was not updated. Save the generated credentials elsewhere.',
    )
  upsertEnv(destination.envPath, values, template)
}

async function configuration(args, interactive) {
  let mode = args.mode
  if (mode && !['production', 'local'].includes(mode))
    throw new Error('--mode must be production or local.')
  if (!mode && interactive && !args.yes)
    mode = await answer(
      prompts.select({
        message: 'Where will you run the application?',
        initialValue: 'production',
        options: [
          {
            value: 'production',
            label: 'Production',
            hint: 'public HTTPS domain',
          },
          {
            value: 'local',
            label: 'Local development',
            hint: 'localhost + public webhook tunnel',
          },
        ],
      }),
    )
  mode ??= 'production'
  const destination = await credentialDestination(args, interactive, mode)
  const { existing } = destination
  let baseUrl = args['base-url']
  if (!baseUrl && interactive && !args.yes) {
    const previous = process.env.BETTER_AUTH_URL || existing.BETTER_AUTH_URL
    let initialValue = mode === 'local' ? 'http://localhost:3000' : undefined
    try {
      if (previous) initialValue = applicationUrl(previous, mode)
    } catch {
      /* Prompt for this environment. */
    }
    baseUrl = await answer(
      prompts.text({
        message:
          mode === 'local'
            ? 'Local application URL'
            : 'Production URL or domain',
        placeholder:
          mode === 'local' ? 'http://localhost:3000' : 'cms.example.com',
        initialValue,
        validate: validation((value) => applicationUrl(value, mode)),
      }),
    )
  }
  if (!baseUrl)
    throw new Error(
      'Provide --base-url, or run interactively to enter the application URL.',
    )
  baseUrl = applicationUrl(baseUrl, mode)
  let webhookUrl = args['webhook-url']
  if (!webhookUrl && mode === 'local' && interactive && !args.yes) {
    prompts.log.info(
      'Forward a public tunnel to /api/webhook/github on your local server (for example, with Smee).',
    )
    webhookUrl = await answer(
      prompts.text({
        message: 'Public webhook URL',
        placeholder: 'https://smee.io/your-channel',
        validate: validation(publicWebhookUrl),
      }),
    )
  }
  if (!webhookUrl && mode === 'local')
    throw new Error(
      'Local mode needs --webhook-url with a public HTTPS tunnel URL.',
    )
  webhookUrl = publicWebhookUrl(webhookUrl || `${baseUrl}/api/webhook/github`)
  let appName = args['app-name']
  if (!appName && interactive && !args.yes)
    appName = await answer(
      prompts.text({
        message: 'GitHub App name (must be unique on GitHub)',
        initialValue: `Pages CMS ${new URL(baseUrl).hostname}`.slice(0, 34),
        validate: (value) =>
          !value?.trim() || value.length > 34
            ? 'Use between 1 and 34 characters.'
            : undefined,
      }),
    )
  appName ||= `Pages CMS ${new URL(baseUrl).hostname}`.slice(0, 34)
  let ownerType = args['owner-type'] || (args.org ? 'org' : undefined)
  if (!ownerType && interactive && !args.yes)
    ownerType = await answer(
      prompts.select({
        message: 'Who will own the GitHub App?',
        options: [
          { value: 'personal', label: 'My GitHub account' },
          { value: 'org', label: 'An organization' },
        ],
      }),
    )
  ownerType ??= 'personal'
  if (!['personal', 'org'].includes(ownerType))
    throw new Error('--owner-type must be personal or org.')
  if (args.org && ownerType !== 'org')
    throw new Error('--org requires --owner-type org.')
  let org = args.org
  if (ownerType === 'org' && !org && interactive && !args.yes)
    org = await answer(
      prompts.text({
        message: 'Organization name',
        validate: validation(validateOrg),
      }),
    )
  if (ownerType === 'org') validateOrg(org)
  let publicApp = args.public ?? false
  if (args.public === undefined && interactive && !args.yes)
    publicApp = await answer(
      prompts.confirm({
        message: 'Allow installation on accounts other than the App owner?',
        initialValue: false,
      }),
    )
  let templates = args.templates ?? false
  if (args.templates === undefined && interactive && !args.yes) {
    prompts.log.info(
      'Creating repositories from templates requires Repository administration: write. Editing existing repositories does not.',
    )
    templates = await answer(
      prompts.confirm({
        message: 'Enable creating repositories from templates?',
        initialValue: false,
      }),
    )
  }
  const port = Number(args.port || 8787)
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('--port must be between 1 and 65535.')
  return {
    mode,
    baseUrl,
    webhookUrl,
    appName,
    ownerType,
    org,
    templates,
    publicApp,
    port,
    destination,
  }
}

function validateOrg(value) {
  if (!value || !/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(value))
    throw new Error('Enter a valid GitHub organization name.')
}

async function main() {
  const args = parseOptions(process.argv.slice(2))
  if (args.help) return printHelp()
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY)
  prompts.intro('Create a GitHub App')
  const config = await configuration(args, interactive)
  const {
    mode,
    baseUrl,
    webhookUrl,
    appName,
    port,
    destination,
    ownerType,
    org,
  } = config
  const host = '127.0.0.1'
  const state = randomBytes(24).toString('hex')
  const manifest = createManifest({
    ...config,
    localCallbackUrl: `http://${host}:${port}/api/github-app/callback`,
  })
  prompts.note(
    [
      `Environment  ${mode === 'local' ? 'Local development' : 'Production'}`,
      `Application  ${baseUrl}`,
      `OAuth        ${manifest.callback_urls[0]}`,
      `Webhook      ${webhookUrl}`,
      `Owner        ${ownerType === 'org' ? org : 'your personal account'}`,
      `Installable  ${manifest.public ? 'any account' : 'App owner only'}`,
      `Templates    ${config.templates ? 'enabled (Administration: write)' : 'disabled (minimal permissions)'}`,
      `Credentials  ${destination.output === 'file' ? destination.envPath : 'terminal output only; no file saved'}`,
    ].join('\n'),
    'Review configuration',
  )
  if (args['dry-run']) {
    prompts.log.info(JSON.stringify(manifest, null, 2))
    prompts.outro('Preview only. No App created; no files changed.')
    return
  }
  if (!args.yes) {
    if (!interactive)
      throw new Error(
        'Use --dry-run to review, or --yes to create the App without prompts.',
      )
    if (
      !(await answer(
        prompts.confirm({
          message: 'Open GitHub to approve this configuration?',
          initialValue: true,
        }),
      ))
    )
      throw cancelled
  }
  const appCreationUrl =
    ownerType === 'org'
      ? `https://github.com/organizations/${encodeURIComponent(org)}/settings/apps/new?state=${state}`
      : `https://github.com/settings/apps/new?state=${state}`
  const code = await runLocalFlow({
    host,
    port,
    state,
    appCreationUrl,
    manifest,
    autoOpen: !args['no-open'],
  })
  const spinner = prompts.spinner()
  spinner.start('Retrieving credentials')
  let converted
  let envValues
  try {
    converted = await exchangeManifestCode(code)
    const examplePath = resolve('.env.example')
    const template = existsSync(examplePath)
      ? readFileSync(examplePath, 'utf8')
      : ''
    envValues = {
      BETTER_AUTH_URL: baseUrl,
      ...setupSecrets(destination.existing, process.env, parseEnv(template)),
      ...appCredentials(converted),
    }
    if (destination.output === 'file')
      saveCredentials(destination, envValues, template)
    spinner.stop(
      destination.output === 'file'
        ? 'Credentials saved (owner-only file permissions)'
        : 'Credentials ready',
    )
  } catch (error) {
    spinner.stop('Setup needs attention')
    if (envValues && interactive) {
      prompts.log.error(toMessage(error))
      if (
        await answer(
          prompts.confirm({
            message:
              'Show the generated credentials so you can save them manually?',
            initialValue: true,
          }),
        )
      ) {
        process.stdout.write(`\n${formatCredentials(envValues)}\n`)
        prompts.outro(
          'The App was created. Credentials were shown but no file was updated.',
        )
        return
      }
    }
    throw error
  }
  if (destination.output === 'terminal') {
    prompts.log.info(
      'Copy these values into your deployment environment. They contain secrets; no file has been written.',
    )
    process.stdout.write(`\n${formatCredentials(envValues)}\n`)
  }
  prompts.note(
    [
      `App: ${converted.name || appName}`,
      `Credentials: ${destination.output === 'file' ? destination.envPath : 'shown above; no file saved'}`,
      `1. Review App settings: https://github.com/settings/apps/${converted.slug}`,
      `   Disable user-to-server token expiration if enabled.`,
      `2. Install: https://github.com/apps/${converted.slug}/installations/new`,
      mode === 'production'
        ? '3. Set the saved variables in your deployment secret store or server environment.'
        : '3. Keep your webhook tunnel running while developing.',
      '4. Apply database migrations, then start or deploy the application.',
    ].join('\n'),
    'Next steps',
  )
  prompts.outro('GitHub App ready. No database seed needed.')
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(realpathSync(resolve(process.argv[1]))).href
) {
  main().catch((error) => {
    if (error === cancelled) prompts.cancel(error.message)
    else prompts.log.error(`Setup failed: ${toMessage(error)}`)
    process.exitCode = 1
  })
}

export function appCredentials(converted) {
  for (const key of [
    'id',
    'slug',
    'client_id',
    'client_secret',
    'pem',
    'webhook_secret',
  ]) {
    if (!converted[key])
      throw new Error(`GitHub manifest response is missing ${key}.`)
  }
  return {
    GITHUB_APP_ID: String(converted.id),
    GITHUB_APP_NAME: converted.slug,
    GITHUB_APP_CLIENT_ID: converted.client_id,
    GITHUB_APP_CLIENT_SECRET: converted.client_secret,
    GITHUB_APP_PRIVATE_KEY: converted.pem,
    GITHUB_APP_WEBHOOK_SECRET: converted.webhook_secret,
  }
}

export async function runLocalFlow({
  host,
  port,
  state,
  appCreationUrl,
  manifest,
  autoOpen,
  onReady,
  timeoutMs = 10 * 60 * 1000,
}) {
  let resolveCode
  let rejectCode

  const codePromise = new Promise((resolve, reject) => {
    resolveCode = resolve
    rejectCode = reject
  })

  const startPath = `/start/${state}`
  const callbackPath = '/api/github-app/callback'

  const server = createServer((req, res) => {
    const url = new URL(req.url || '/', `http://${host}:${port}`)

    if (url.pathname === startPath) {
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'referrer-policy': 'no-referrer',
      })
      res.end(renderAutoPostPage({ appCreationUrl, manifest }))
      return
    }

    if (url.pathname === callbackPath) {
      const incomingState = url.searchParams.get('state') || ''
      const code =
        url.searchParams.get('code') ||
        url.searchParams.get('temporary_code') ||
        ''
      const error = url.searchParams.get('error') || ''

      if (incomingState !== state) {
        res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' })
        res.end('Invalid state. Return to terminal.')
        return
      }

      if (error) {
        res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' })
        res.end(`Error from GitHub: ${error}`)
        rejectCode(new Error(`GitHub returned error: ${error}`))
        return
      }

      if (!code) {
        res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' })
        res.end('No temporary code received.')
        rejectCode(new Error('Missing temporary code in callback URL.'))
        return
      }

      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end('<h1>GitHub App created.</h1><p>Return to terminal.</p>')
      resolveCode(code)
      return
    }

    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('Not found')
  })

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => resolve())
  })

  const launchUrl = `http://${host}:${server.address().port}${startPath}`
  prompts.log.info(`Approve the App in your browser:\n${launchUrl}`)
  onReady?.(launchUrl)
  if (autoOpen) tryOpenBrowser(launchUrl)
  const spinner = prompts.spinner()
  spinner.start('Waiting for GitHub approval (Ctrl+C to cancel)')
  const interrupt = () => rejectCode(cancelled)
  process.once('SIGINT', interrupt)
  process.once('SIGTERM', interrupt)
  const timeoutId = setTimeout(
    () => rejectCode(new Error('Timed out waiting for browser callback.')),
    timeoutMs,
  )

  try {
    return await codePromise
  } finally {
    clearTimeout(timeoutId)
    process.off('SIGINT', interrupt)
    process.off('SIGTERM', interrupt)
    spinner.stop('Browser handoff finished')
    server.close()
    server.closeAllConnections()
  }
}

function renderAutoPostPage({ appCreationUrl, manifest }) {
  const escapedAction = escapeHtml(appCreationUrl)
  const escapedManifest = escapeHtml(JSON.stringify(manifest))

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>GitHub App Setup</title>
  </head>
  <body>
    <form id="manifest-form" method="post" action="${escapedAction}">
      <input type="hidden" name="manifest" value="${escapedManifest}" />
      <noscript>
        <p>JavaScript is disabled. Click continue.</p>
        <button type="submit">Continue</button>
      </noscript>
    </form>
    <script>
      document.getElementById("manifest-form").submit();
    </script>
  </body>
</html>`
}

async function exchangeManifestCode(code) {
  const response = await fetch(
    `https://api.github.com/app-manifests/${encodeURIComponent(code)}/conversions`,
    {
      method: 'POST',
      signal: AbortSignal.timeout(30_000),
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    },
  )

  if (!response.ok) {
    throw new Error(`GitHub manifest conversion failed (${response.status}).`)
  }

  return response.json()
}

export function setupSecrets(existing, environment = {}, example = {}) {
  const retained = (name) => {
    const value = environment[name] || existing[name]
    return value && value !== example[name] ? value : undefined
  }
  return {
    BETTER_AUTH_SECRET:
      retained('BETTER_AUTH_SECRET') || randomBytes(32).toString('base64url'),
    CRYPTO_KEY: retained('CRYPTO_KEY') || randomBytes(32).toString('base64'),
  }
}

export function upsertEnv(filePath, values, template = '') {
  let source = existsSync(filePath) ? readFileSync(filePath, 'utf8') : template
  for (const [key, rawValue] of Object.entries(values)) {
    if (!/^[A-Z_][A-Z\d_]*$/.test(key)) throw new Error('Invalid env key.')
    const value = rawValue == null ? '' : String(rawValue)
    const line = `${key}=${JSON.stringify(value)}`
    // Replace complete quoted declarations, including literal multiline PEMs.
    // Update duplicate declarations too, so a later stale key cannot win.
    const declaration = new RegExp(
      String.raw`(^|\n)([\t ]*(?:export[\t ]+)?)${key}[\t ]*=[\t ]*(?:"(?:\\[\s\S]|[^"\\])*"|'[^']*'|\x60[^\x60]*\x60|[^\r\n]*)`,
      'g',
    )
    let found = false
    source = source.replace(declaration, (_match, newline, leading) => {
      found = true
      return `${newline}${leading}${line}`
    })
    if (!found) source = `${source.trimEnd()}${source ? '\n' : ''}${line}\n`
  }
  writeFileSync(filePath, `${source.trimEnd()}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  })
  chmodSync(filePath, 0o600)
}

function tryOpenBrowser(url) {
  const platform = process.platform

  if (platform === 'darwin') {
    execFile('open', [url], () => {})
    return
  }

  if (platform === 'win32') {
    execFile('cmd', ['/c', 'start', '', url], () => {})
    return
  }

  execFile('xdg-open', [url], () => {})
}

function printHelp() {
  console.log(`Create a GitHub App with guided production/local setup.

Usage: pagescms-setup-github-app [options]

  --mode production|local   Defaults to production; interactive mode asks
  --base-url <url/domain>    Required in unattended mode; public HTTPS in production
  --webhook-url <url>        Public HTTPS endpoint; required in local mode
  --app-name <name>          Unique GitHub App name
  --owner-type personal|org  App owner (default: personal)
  --org <slug>              Organization owner
  --public                  Allow installations outside the App owner's account
  --templates               Enable template creation (Administration: write)
  --output file|terminal    Save to a file (default), or show copyable values
  --env <path>              File path (interactive mode asks)
  --overwrite               Explicitly allow managed-key updates in an existing file
  --port <number>           Local registration callback port (default: 8787)
  --no-open                 Print the browser link without opening it
  --dry-run                 Preview; no browser, App creation or file changes
  --yes, -y                 Accept the reviewed configuration without prompts
  --help, -h                Show help

Examples:
  pagescms-setup-github-app
  pagescms-setup-github-app --base-url cms.example.com --dry-run
  pagescms-setup-github-app --mode local --base-url http://localhost:3000 --webhook-url https://smee.io/your-channel

Secrets are printed only when terminal output is chosen (or explicitly accepted
for recovery). Existing files always need confirmation or --overwrite, even
with --yes. File defaults: .env.production.local for production, .env.local for local.
The manifest handoff callback is local even for production setup. Run this
command on the same computer as your browser (or forward the callback port).`)
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function toMessage(error) {
  return error instanceof Error ? error.message : String(error)
}
