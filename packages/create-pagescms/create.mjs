import { mkdir, readdir, writeFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { randomBytes } from 'node:crypto'

export const VERSION = '3.0.0-beta.0'

export async function createProject(directory, target) {
  if (!['node', 'cloudflare', 'netlify', 'vercel'].includes(target))
    throw new Error('Target must be node, cloudflare, netlify or vercel')
  const runtime = target === 'cloudflare' ? 'cloudflare' : 'node'
  const serverless = target === 'netlify' || target === 'vercel'
  const root = resolve(directory)
  await mkdir(root, { recursive: true })
  if ((await readdir(root)).length)
    throw new Error(`Directory is not empty: ${root}`)
  const name =
    basename(root)
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, '-')
      .replace(/^[._-]+/, '') || 'pagescms-app'
  const scripts = {
    dev: 'pagescms dev',
    build: 'pagescms build',
    ...(serverless
      ? { 'build:function': 'pagescms build --remote-libsql' }
      : {}),
    preview: 'pagescms preview',
    migrate: 'pagescms migrate',
    'setup:github-app': 'pagescms-setup-github-app',
    'migrate:2x': 'pagescms-collaborators migrate-2x',
    ...(runtime === 'node'
      ? { start: 'pagescms start' }
      : {
          'migrate:remote': 'pagescms migrate --remote',
          'deploy:dry-run': 'wrangler deploy --dry-run',
          deploy: 'wrangler deploy',
        }),
  }
  const overrides = {
    '@tiptap/extension-bubble-menu': '3.31.3',
    '@tiptap/extension-floating-menu': '3.31.3',
  }
  const manifest = {
    name,
    private: true,
    type: 'module',
    engines: { node: '>=22.19.0' },
    scripts,
    dependencies: {
      pagescms: VERSION,
      react: '19.3.1',
      'react-dom': '19.3.1',
      ...(target === 'vercel' ? { '@vercel/functions': '3.11.3' } : {}),
    },
    overrides,
    pnpm: { overrides },
    ...(target === 'cloudflare'
      ? { devDependencies: { wrangler: '4.162.0' } }
      : {}),
  }
  const environment =
    'BETTER_AUTH_URL="http://localhost:3000"\nDATABASE_URL="file:.data/pagescms.db"\nGITHUB_APP_NAME=""\nGITHUB_APP_CLIENT_ID=""\nGITHUB_APP_CLIENT_SECRET=""\nGITHUB_APP_ID=""\nGITHUB_APP_PRIVATE_KEY=""\nGITHUB_APP_WEBHOOK_SECRET=""\nCRYPTO_KEY=""\n'
  const files = {
    'package.json': `${JSON.stringify(manifest, null, 2)}\n`,
    'pagescms.config.ts': `import { defineConfig } from 'pagescms'\n\nexport default defineConfig({ target: '${runtime}' })\n`,
    '.gitignore':
      'node_modules/\ndist/\n.pagescms/\n.wrangler/\n.data/\n.env*\n!.env.example\n.dev.vars*\n',
    '.env.example': `BETTER_AUTH_SECRET=""\n${environment}`,
    '.env.local': `BETTER_AUTH_SECRET="${randomBytes(32).toString('base64')}"\n${environment}`,
    'README.md': `# Pages CMS\n\nSee the [self-hosting guide](https://pagescms.org/docs/self-hosting/) for GitHub App, database and deployment setup.\n\nThe generated \`.env.local\` contains your local authentication secret. Run \`npm install\`, then run \`npm run setup:github-app\`, \`npm run migrate -- --local\` and \`npm run dev\`.\n${target === 'cloudflare' ? '\nSet your D1 database ID in `wrangler.jsonc` before deploying. Run `npm run migrate:remote`, `npm run build`, then `npm run deploy`. Set deployed secrets in Cloudflare.\n' : serverless ? `\nSee the [${target} deployment guide](https://pagescms.org/docs/self-hosting/${target}/) for remote database and deployment setup.\n` : '\nRun `npm run build` and `npm start` to serve a production build.\n'}`,
  }
  if (target === 'vercel') {
    files['.vercelignore'] =
      'node_modules/\ndist/\n.pagescms/\n.wrangler/\n.data/\n.env*\n.dev.vars*\n'
    files['vercel.json'] = `${JSON.stringify(
      {
        buildCommand: 'npm run build:function',
        outputDirectory: 'dist/client',
        headers: [
          {
            source: '/(.*)',
            headers: [
              {
                key: 'Content-Security-Policy',
                value: "frame-ancestors 'none'",
              },
              { key: 'X-Frame-Options', value: 'DENY' },
            ],
          },
        ],
        rewrites: [
          { source: '/api/(.*)', destination: '/api' },
          {
            source: '/.well-known/((?!acme-challenge(?:/|$)).*)',
            destination: '/api',
          },
          { source: '/(.*)', destination: '/index.html' },
        ],
      },
      null,
      2,
    )}\n`
    files['api/index.mjs'] =
      `import { waitUntil } from '@vercel/functions'\nimport app from '../dist/server/server.js'\n\nexport default { fetch: (request) => app.fetch(request, waitUntil) }\n`
  }
  if (target === 'netlify') {
    files['netlify.toml'] =
      `[build]\n  command = "npm run build:function"\n  publish = "dist/client"\n  functions = "netlify/functions"\n\n[[redirects]]\n  from = "/*"\n  to = "/index.html"\n  status = 200\n`
    files['netlify/functions/api.mjs'] =
      `import app from '../../dist/server/server.js'\n\nexport default (request, context) => app.fetch(request, (promise) => context.waitUntil(promise))\nexport const config = { path: ['/api/*', '/.well-known/*'] }\n`
  }
  if (target === 'cloudflare') {
    files['wrangler.jsonc'] = `${JSON.stringify(
      {
        name: 'pagescms',
        main: 'pagescms/server-entry',
        compatibility_date: '2026-08-20',
        compatibility_flags: ['nodejs_compat'],
        d1_databases: [
          {
            binding: 'DATABASE',
            database_name: 'pagescms',
            database_id: '00000000-0000-0000-0000-000000000001',
            migrations_dir: 'node_modules/pagescms/drizzle',
            migrations_table: '__pagescms_core_d1_migrations',
          },
        ],
      },
      null,
      2,
    )}\n`
  }
  await Promise.all(
    Object.entries(files).map(async ([file, content]) => {
      await mkdir(resolve(root, file, '..'), { recursive: true })
      await writeFile(resolve(root, file), content, {
        flag: 'wx',
        ...(file === '.env.local' ? { mode: 0o600 } : {}),
      })
    }),
  )
  return root
}
