import { rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..')

rmSync(resolve(rootDirectory, '.wrangler/dry-run'), {
  force: true,
  recursive: true,
})
