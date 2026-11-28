import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadConfigFromFile } from 'vite'
import { defineConfig } from './config'
import type { PackageConfigInput } from './config'

export async function loadPackageConfig(root: string) {
  const path = resolve(root, 'pagescms.config.ts')
  const loaded = existsSync(path)
    ? await loadConfigFromFile(
        { command: 'build', mode: 'production' },
        path,
        root,
      )
    : undefined
  return defineConfig(
    (loaded?.config ?? { target: 'node' }) as unknown as PackageConfigInput,
  )
}
