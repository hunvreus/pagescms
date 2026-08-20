import YAML from 'yaml'

export type ConfigurationSourceDiagnostic = Readonly<{
  severity: 'error'
  code: string
  from: number | null
  to: number | null
  message: string
}>

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
