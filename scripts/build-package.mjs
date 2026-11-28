import { buildReference } from './build-reference.mjs'
import {
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join, relative, resolve } from 'node:path'
import { build } from 'vite'

buildReference()

const entry = Object.fromEntries(
  ['vite', 'config', 'generate', 'cli', 'migrate', 'smtp']
    .filter((name) => existsSync(`src/package/${name}.ts`))
    .map((name) => [name, `src/package/${name}.ts`]),
)

await build({
  configFile: false,
  build: {
    outDir: 'dist/package',
    emptyOutDir: true,
    lib: { entry, formats: ['es'], fileName: (_format, name) => `${name}.mjs` },
    rollupOptions: {
      external: (id) => !id.startsWith('.') && !id.startsWith('/'),
    },
  },
})

rmSync('dist/types', { recursive: true, force: true })
const declarations = spawnSync(
  process.execPath,
  ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.package.json'],
  { stdio: 'inherit' },
)
if (declarations.status !== 0)
  throw new Error('Package declaration build failed')
const typeRoot = resolve('dist/types')
function rewrite(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) rewrite(path)
    else if (path.endsWith('.d.ts')) {
      const source = readFileSync(path, 'utf8').replace(
        /(['"])#\/([^'"]+)\1/g,
        (_match, quote, target) => {
          let specifier = relative(
            dirname(path),
            resolve(typeRoot, target),
          ).replaceAll('\\', '/')
          if (!specifier.startsWith('.')) specifier = `./${specifier}`
          return `${quote}${specifier}${quote}`
        },
      )
      writeFileSync(path, source)
    }
  }
}
rewrite(typeRoot)
