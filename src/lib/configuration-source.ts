import YAML from 'yaml'
import type { ZodIssue } from 'zod/v3'

import { ConfigurationSchema } from './configuration-schema'

export type ConfigurationSourceDiagnostic = Readonly<{
  severity: 'error' | 'warning'
  code: string
  from: number | null
  to: number | null
  message: string
}>

function diagnosticRange(document: YAML.Document.Parsed, path: PropertyKey[]) {
  let node = document.getIn(path, true) as
    { range?: readonly number[] } | undefined
  if (!node?.range && path.length) {
    node = document.getIn(path.slice(0, -1), true) as
      { range?: readonly number[] } | undefined
  }
  return {
    from: node?.range?.[0] ?? null,
    to: node?.range?.[1] ?? null,
  }
}

export type ParsedConfigurationSource = Readonly<{
  configuration: unknown
  diagnostics: readonly ConfigurationSourceDiagnostic[]
}>

/**
 * Parses `.pages.yml` without applying product validation or defaults.
 *
 * The parser intentionally returns YAML's recoverable value alongside source
 * diagnostics so an editor can render precise errors without losing the draft.
 */
export function parseConfigurationSource(
  source: string,
): ParsedConfigurationSource {
  return readConfigurationSource(source).parsed
}

function readConfigurationSource(source: string) {
  const document = YAML.parseDocument(source, {
    prettyErrors: false,
    strict: false,
  })

  const diagnostics: ConfigurationSourceDiagnostic[] = document.errors.map(
    (error) => ({
      severity: 'error' as const,
      code: error.code,
      from: error.pos[0],
      to: error.pos[1],
      message: error.message,
    }),
  )

  YAML.visit(document, {
    Alias: (_key, alias, path) => {
      // yaml's resolve() typing omits undefined for unresolved anchors.
      const target = alias.resolve(document) as YAML.Node | undefined
      if (target && !path.includes(target)) return
      diagnostics.push({
        severity: 'error',
        code: target ? 'CYCLIC_ALIAS' : 'UNRESOLVED_ALIAS',
        from: alias.range?.[0] ?? null,
        to: alias.range?.[1] ?? null,
        message: target
          ? `Alias '*${alias.source}' creates a circular reference.`
          : `Alias '*${alias.source}' must reference an earlier anchor.`,
      })
    },
  })
  let configuration: unknown = {}
  if (
    !diagnostics.some(
      ({ code }) => code === 'UNRESOLVED_ALIAS' || code === 'CYCLIC_ALIAS',
    )
  ) {
    try {
      configuration = document.toJS() ?? {}
    } catch (error) {
      diagnostics.push({
        severity: 'error',
        code: 'YAML_CONVERSION_ERROR',
        from: document.contents?.range[0] ?? null,
        to: document.contents?.range[1] ?? null,
        message:
          error instanceof Error
            ? error.message
            : 'Could not read YAML values.',
      })
    }
  }
  return { document, parsed: { configuration, diagnostics } }
}

export function validateConfigurationSource(
  source: string,
): ParsedConfigurationSource {
  const { document, parsed } = readConfigurationSource(source)
  if (parsed.diagnostics.length) return parsed

  const result = ConfigurationSchema.safeParse(parsed.configuration)
  if (result.success) return parsed

  const diagnostics: ConfigurationSourceDiagnostic[] = []
  function visit(issue: ZodIssue) {
    if (issue.code === 'invalid_union') {
      const rootIssues = issue.unionErrors.flatMap((error) =>
        error.issues.filter((child) => child.path.length === issue.path.length),
      )
      for (const error of issue.unionErrors) {
        for (const child of error.issues) {
          if (child.path.length !== issue.path.length) visit(child)
        }
      }
      if (rootIssues.length === issue.unionErrors.length) {
        diagnostics.push({
          severity: 'error',
          code: issue.code,
          ...diagnosticRange(document, issue.path),
          message: rootIssues.at(-1)!.message,
        })
      }
      return
    }
    if (issue.code === 'unrecognized_keys') {
      const node = document.getIn(issue.path, true)
      if (YAML.isMap(node)) {
        for (const key of issue.keys) {
          const pair = node.items.find(
            (item) => YAML.isScalar(item.key) && item.key.value === key,
          )
          if (YAML.isScalar(pair?.key) && pair.key.range) {
            diagnostics.push({
              severity: 'warning',
              code: issue.code,
              from: pair.key.range[0],
              to: pair.key.range[1],
              message: `Property '${key}' isn't valid and will be ignored.`,
            })
          }
        }
      }
      return
    }
    diagnostics.push({
      severity: 'error',
      code: issue.code,
      ...diagnosticRange(document, issue.path),
      message: issue.message,
    })
  }
  result.error.issues.forEach(visit)
  return { configuration: parsed.configuration, diagnostics }
}
