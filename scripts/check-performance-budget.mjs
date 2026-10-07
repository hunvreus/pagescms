import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { gzipSync } from 'node:zlib'

const root = resolve('dist/client')
const manifest = JSON.parse(
  readFileSync(resolve(root, '.vite/manifest.json'), 'utf8'),
)
const chunks = Object.values(manifest).filter((entry) =>
  entry.file.endsWith('.js'),
)
const sizes = new Map(
  chunks.map((entry) => [
    entry.file,
    gzipSync(readFileSync(resolve(root, entry.file))).byteLength,
  ]),
)
const entryFiles = Object.entries(manifest)
  .filter(([, entry]) => entry.isEntry && entry.file.endsWith('.js'))
  .map(([key]) => key)
if (!entryFiles.length) throw new Error('Client build contains no entry points')
const visited = new Set()
function visit(key) {
  if (visited.has(key)) return
  visited.add(key)
  const entry = manifest[key]
  if (!entry) throw new Error(`Missing manifest import: ${key}`)
  for (const dependency of entry.imports ?? []) visit(dependency)
}
entryFiles.forEach(visit)
const initial = [...visited].reduce(
  (total, key) => total + (sizes.get(manifest[key].file) ?? 0),
  0,
)
const largest = Math.max(...sizes.values())
const templates = ['nextjs', 'astro', 'eleventy'].reduce(
  (total, name) =>
    total +
    readFileSync(resolve(root, `images/${name}-blog-template.webp`)).byteLength,
  0,
)
const limits = { initial: 250_000, largest: 200_000, templates: 150_000 }
for (const key of visited) {
  if (
    /(?:content-entry-editor|structured-content-field|media-browser|rich-text-field|code-editor)-/.test(
      manifest[key].file,
    )
  ) {
    throw new Error(
      `Heavy editor/media code leaked into the initial dependency graph: ${manifest[key].file}`,
    )
  }
}
const results = { initial, largest, templates }
for (const [name, size] of Object.entries(results)) {
  console.log(
    `${name}: ${size.toLocaleString()} bytes / ${limits[name].toLocaleString()} budget${name === 'templates' ? '' : ' (gzip)'}`,
  )
  if (size > limits[name]) process.exitCode = 1
}
