import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve } from 'node:path'

export function copyCloudflareDeployConfig(
  packageRoot: string,
  projectRoot: string,
) {
  const source = resolve(
    realpathSync(packageRoot),
    '.wrangler/deploy/config.json',
  )
  const destination = resolve(
    realpathSync(projectRoot),
    '.wrangler/deploy/config.json',
  )
  let input: unknown
  try {
    input = JSON.parse(readFileSync(source, 'utf8'))
  } catch (error) {
    throw new Error(
      'Cloudflare build did not produce a valid deployment configuration',
      { cause: error },
    )
  }
  const outputRoot = realpathSync(resolve(projectRoot, 'dist'))
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('Invalid generated Cloudflare deployment configuration')
  const config = input as Record<string, unknown>
  const rebase = (value: unknown) => {
    if (typeof value !== 'string' || !value)
      throw new Error('Invalid generated Cloudflare deployment path')
    const target = realpathSync(resolve(dirname(source), value))
    const inside = relative(outputRoot, target)
    if (!inside || inside.startsWith('..') || isAbsolute(inside))
      throw new Error(
        'Generated Cloudflare deployment path is outside this project',
      )
    return relative(dirname(destination), target)
  }
  const output: Record<string, unknown> = {
    configPath: rebase(config.configPath),
  }
  if (config.prerenderWorkerConfigPath !== undefined)
    output.prerenderWorkerConfigPath = rebase(config.prerenderWorkerConfigPath)
  if (config.auxiliaryWorkers !== undefined) {
    if (!Array.isArray(config.auxiliaryWorkers))
      throw new Error('Invalid generated Cloudflare auxiliary workers')
    output.auxiliaryWorkers = config.auxiliaryWorkers.map((worker: unknown) => {
      if (!worker || typeof worker !== 'object' || Array.isArray(worker))
        throw new Error('Invalid generated Cloudflare auxiliary worker')
      return {
        ...worker,
        configPath: rebase((worker as Record<string, unknown>).configPath),
      }
    })
  }
  mkdirSync(dirname(destination), { recursive: true })
  writeFileSync(destination, JSON.stringify(output))
}
