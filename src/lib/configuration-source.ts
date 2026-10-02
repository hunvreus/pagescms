import YAML from 'yaml'

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
  const document = YAML.parseDocument(source, {
    prettyErrors: false,
    strict: false,
  })

  const diagnostics = document.errors.map((error) => ({
    severity: 'error' as const,
    code: error.code,
    from: error.pos[0],
    to: error.pos[1],
    message: error.message,
  }))

  return {
    configuration: document.toJS() ?? {},
    diagnostics,
  }
}

export function validateConfigurationSource(
  source: string,
): ParsedConfigurationSource {
  const document = YAML.parseDocument(source, {
    prettyErrors: false,
    strict: false,
  })
  const parsed = parseConfigurationSource(source)
  if (parsed.diagnostics.length) return parsed

  const result = ConfigurationSchema.safeParse(parsed.configuration)
  if (result.success) return parsed

  return {
    configuration: parsed.configuration,
    diagnostics: result.error.issues.map((issue) => ({
      severity: issue.code === 'unrecognized_keys' ? 'warning' : 'error',
      code: issue.code,
      ...diagnosticRange(document, issue.path),
      message: issue.message,
    })),
  }
}
