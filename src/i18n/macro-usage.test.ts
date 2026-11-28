import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { expect, it } from 'vitest'

it('keeps compile-time translation helpers out of runtime dependency arrays and values', () => {
  const escaped: string[] = []
  function scan(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) {
        scan(path)
        continue
      }
      if (!path.endsWith('.tsx') || path.endsWith('.test.tsx')) continue
      const text = readFileSync(path, 'utf8')
      if (!text.includes('@lingui/react/macro')) continue
      const file = ts.createSourceFile(
        path,
        text,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      )
      const helpers = new Set<string>()
      function bindings(node: ts.Node) {
        if (
          ts.isBindingElement(node) &&
          node.propertyName?.getText(file) === 't' &&
          ts.isIdentifier(node.name)
        )
          helpers.add(node.name.text)
        ts.forEachChild(node, bindings)
      }
      bindings(file)
      function references(node: ts.Node) {
        if (ts.isIdentifier(node) && helpers.has(node.text)) {
          const parent = node.parent
          if (
            !(ts.isBindingElement(parent) && parent.name === node) &&
            !(ts.isCallExpression(parent) && parent.expression === node)
          ) {
            escaped.push(
              `${path}:${file.getLineAndCharacterOfPosition(node.getStart()).line + 1}: ${node.text}`,
            )
          }
        }
        ts.forEachChild(node, references)
      }
      references(file)
    }
  }
  scan(fileURLToPath(new URL('../', import.meta.url)))
  expect(
    escaped,
    'Lingui removes macro helpers; use the live i18n object for hook dependencies',
  ).toEqual([])
})
