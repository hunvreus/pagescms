import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { copyCloudflareDeployConfig } from './deploy-config'

const roots: Array<string> = []
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true })
})

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'pagescms-deploy-config-'))
  roots.push(root)
  const project = join(root, 'project')
  const pkg = join(root, 'package')
  const source = join(pkg, '.wrangler/deploy/config.json')
  const target = join(project, 'dist/my_cms/wrangler.json')
  mkdirSync(dirname(source), { recursive: true })
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, '{}')
  return { project, pkg, source, target }
}

it('rebases the generated renamed Worker redirect into the project', () => {
  const { project, pkg, source, target } = fixture()
  writeFileSync(
    source,
    JSON.stringify({
      configPath: relative(dirname(source), target),
      auxiliaryWorkers: [],
    }),
  )
  copyCloudflareDeployConfig(pkg, project)
  const redirect = JSON.parse(
    readFileSync(join(project, '.wrangler/deploy/config.json'), 'utf8'),
  )
  expect(redirect.configPath).toBe('../../dist/my_cms/wrangler.json')
})

it('rejects a redirect from a concurrent build in another project', () => {
  const one = fixture()
  const other = fixture()
  writeFileSync(
    one.source,
    JSON.stringify({ configPath: relative(dirname(one.source), other.target) }),
  )
  expect(() => copyCloudflareDeployConfig(one.pkg, one.project)).toThrow(
    /outside this project/,
  )
})

it('rebases auxiliary and prerender Worker paths', () => {
  const { project, pkg, source, target } = fixture()
  const auxiliary = join(project, 'dist/extra/wrangler.json')
  mkdirSync(dirname(auxiliary), { recursive: true })
  writeFileSync(auxiliary, '{}')
  writeFileSync(
    source,
    JSON.stringify({
      configPath: relative(dirname(source), target),
      auxiliaryWorkers: [{ configPath: relative(dirname(source), auxiliary) }],
      prerenderWorkerConfigPath: relative(dirname(source), auxiliary),
    }),
  )
  copyCloudflareDeployConfig(pkg, project)
  const redirect = JSON.parse(
    readFileSync(join(project, '.wrangler/deploy/config.json'), 'utf8'),
  )
  expect(redirect.auxiliaryWorkers).toEqual([
    { configPath: '../../dist/extra/wrangler.json' },
  ])
  expect(redirect.prerenderWorkerConfigPath).toBe(
    '../../dist/extra/wrangler.json',
  )
})

it('fails if the generated redirect is missing', () => {
  const { pkg, project } = fixture()
  expect(() => copyCloudflareDeployConfig(pkg, project)).toThrow()
})
