import { configurationNameIssues } from '#/shared/configuration-names'
import { readYamlSource, sourceNode } from '#/shared/configuration-yaml'
import type { SourceNode } from '#/shared/configuration-yaml'
import type { ZodIssue, ZodType } from 'zod'

import { DeploymentConfigurationSchema } from '#/shared/configuration-schema'

export type ConfigurationSourceDiagnostic = Readonly<{
  severity: 'error' | 'warning'
  code: string
  from: number | null
  to: number | null
  message: string
}>

function diagnosticRange(root: SourceNode | undefined, path: PropertyKey[]) {
  const node =
    sourceNode(root, path) ??
    (path.length ? sourceNode(root, path.slice(0, -1)) : undefined)
  return { from: node?.from ?? null, to: node?.to ?? null }
}

export type ParsedConfigurationSource = Readonly<{
  configuration: unknown
  diagnostics: readonly ConfigurationSourceDiagnostic[]
}>

/**
 * Parses `.pages.yml` without applying product validation or defaults.
 */
export function parseConfigurationSource(
  source: string,
): ParsedConfigurationSource {
  return readConfigurationSource(source).parsed
}

function readConfigurationSource(source: string) {
  const { root, configuration, diagnostics } = readYamlSource(source)
  return { document: root, parsed: { configuration, diagnostics } }
}

export function validateConfigurationSource(
  source: string,
  schema: ZodType = DeploymentConfigurationSchema,
): ParsedConfigurationSource {
  const { document, parsed } = readConfigurationSource(source)
  if (
    parsed.diagnostics.some(
      ({ code }) =>
        !['UNRESOLVED_ALIAS', 'CYCLIC_ALIAS', 'DUPLICATE_KEY'].includes(code),
    )
  )
    return parsed

  const result = schema.safeParse(parsed.configuration)
  if (result.success) return parsed

  const diagnostics: ConfigurationSourceDiagnostic[] = [...parsed.diagnostics]
  function visit(issue: ZodIssue) {
    const range = diagnosticRange(document, issue.path)
    if (
      parsed.diagnostics.some(
        (diagnostic) =>
          (diagnostic.code === 'UNRESOLVED_ALIAS' ||
            diagnostic.code === 'CYCLIC_ALIAS') &&
          diagnostic.from === range.from &&
          diagnostic.to === range.to,
      )
    )
      return
    if (issue.code === 'invalid_union' && issue.errors.length) {
      const rootIssues = issue.errors.flatMap((errors) =>
        errors.filter((child) => child.path.length === 0),
      )
      for (const errors of issue.errors) {
        for (const child of errors) {
          // Union branches report paths relative to this union in Zod 4.
          if (child.path.length)
            visit({ ...child, path: [...issue.path, ...child.path] })
        }
      }
      if (rootIssues.length === issue.errors.length) {
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
      const node = sourceNode(document, issue.path)
      for (const key of issue.keys) {
        const keyNode = node?.keys?.get(key)?.key
        if (keyNode) {
          diagnostics.push({
            severity: 'warning',
            code: issue.code,
            from: keyNode.from,
            to: keyNode.to,
            message: `Property '${key}' isn't valid and will be ignored.`,
          })
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
  // Strict unknown-key issues can prevent schema refinements from running.
  for (const issue of configurationNameIssues(parsed.configuration)) {
    if (
      !diagnostics.some((diagnostic) => diagnostic.message === issue.message)
    ) {
      diagnostics.push({
        severity: 'error',
        code: 'custom',
        ...diagnosticRange(document, issue.path),
        message: issue.message,
      })
    }
  }
  return { configuration: parsed.configuration, diagnostics }
}
