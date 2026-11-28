import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { referenceOutputs } from './build-reference.mjs'

test('public artifact contains only curated Markdown with deterministic identities', () => {
  const outputs = referenceOutputs()
  const manifest = JSON.parse(outputs.get('public/reference/manifest.json'))
  assert.ok(manifest.files.length > 35)
  assert.ok(manifest.files.some((file) => file.path === 'docs.json'))
  assert.doesNotMatch(
    outputs.get('public/reference/docs/index.md'),
    /{%\s*lucide/,
  )
  assert.doesNotMatch(outputs.get('public/reference.md'), /{%\s*lucide/)
  const navigation = JSON.parse(outputs.get('public/reference/docs.json'))
  assert.ok(
    navigation.menu.every((group) => group.id && Array.isArray(group.items)),
  )
  assert.equal(
    manifest.files.some((file) =>
      /runbook|docs\/features\/|postgresql-migration/.test(file.path),
    ),
    false,
  )
  assert.equal(
    manifest.files.some(
      (file) => file.path === 'docs/configuration/localization.md',
    ),
    true,
  )
  for (const file of manifest.files) {
    assert.match(file.sha256, /^[a-f0-9]{64}$/)
    assert.ok(outputs.has('public/reference/' + file.path))
  }
  assert.equal(
    outputs.get('src/lib/configuration-reference.mjs'),
    readFileSync('src/lib/configuration-reference.mjs', 'utf8'),
  )
  for (const path of ['authentication', 'caching', 'database']) {
    assert.equal(
      outputs.has(`public/reference/docs/development/${path}.md`),
      false,
    )
  }
  assert.deepEqual([...referenceOutputs()], [...outputs])
})
