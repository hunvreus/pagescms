#!/usr/bin/env node
import * as p from '@clack/prompts'
import { spawn } from 'node:child_process'
import { parseArgs } from 'node:util'
import { createProject } from './create.mjs'

function answer(value) {
  if (p.isCancel(value)) {
    p.cancel(
      'Setup cancelled. You can continue using the commands in the project README.',
    )
    process.exit(0)
  }
  return value
}

async function run(path, ...args) {
  const command = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const code = await new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: path, stdio: 'inherit' })
    child.on('error', reject)
    child.on('close', resolve)
  })
  if (code !== 0)
    throw new Error(
      `npm ${args.join(' ')} failed. Continue using the project README.`,
    )
}

try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      target: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  })
  if (values.help) {
    console.log(
      'Usage: npm create pagescms@beta -- [directory] [--target node|cloudflare|netlify|vercel]',
    )
    process.exit(0)
  }
  if (positionals.length > 1) throw new Error('Provide one project directory')
  const interactive = process.stdin.isTTY && process.stdout.isTTY
  if (interactive) p.intro('Create Pages CMS')
  const directory =
    positionals[0] ??
    (interactive
      ? answer(
          await p.text({
            message: 'Where should we create your project?',
            placeholder: 'my-pagescms',
            defaultValue: 'my-pagescms',
            validate: (value) =>
              value.trim() ? undefined : 'Enter a directory',
          }),
        )
      : 'my-pagescms')
  const target =
    values.target ??
    (interactive
      ? answer(
          await p.select({
            message: 'Where will you deploy?',
            options: [
              {
                value: 'node',
                label: 'Node.js',
                hint: 'a server or container',
              },
              {
                value: 'cloudflare',
                label: 'Cloudflare Workers',
                hint: 'with D1',
              },
              {
                value: 'netlify',
                label: 'Netlify',
                hint: 'experimental, with remote libSQL',
              },
              {
                value: 'vercel',
                label: 'Vercel',
                hint: 'experimental, with remote libSQL',
              },
            ],
          }),
        )
      : 'node')
  const path = await createProject(directory, target)
  if (!interactive) {
    console.log(
      `Created ${target} project at ${path}.\nRun npm install and follow README.md to configure and start it.`,
    )
  } else {
    p.log.success(`Created ${target} project at ${path}`)
    const guided = answer(
      await p.confirm({
        message: 'Install dependencies and continue with guided setup?',
        initialValue: true,
      }),
    )
    let githubReady = false
    let databaseReady = false
    if (guided) {
      await run(path, 'install')
      if (
        answer(
          await p.confirm({
            message: 'Set up a GitHub App now?',
            initialValue: true,
          }),
        )
      ) {
        await run(path, 'run', 'setup:github-app')
        githubReady = true
      }
      if (
        answer(
          await p.confirm({
            message: 'Initialize the local database now?',
            initialValue: true,
          }),
        )
      ) {
        await run(path, 'run', 'migrate', '--', '--local')
        databaseReady = true
      }
    }
    const next = [
      `cd '${path.replaceAll("'", "'\\''")}'`,
      ...(!guided ? ['npm install'] : []),
      ...(!githubReady ? ['npm run setup:github-app'] : []),
      ...(!databaseReady ? ['npm run migrate -- --local'] : []),
      'npm run dev',
    ]
    p.note(next.join('\n'), 'Next steps')
    p.outro('See README.md for deployment commands.')
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
