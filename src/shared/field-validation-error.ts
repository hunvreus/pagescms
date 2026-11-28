import type { FieldIssue } from '#/lib/field-values'

const prefix = 'Content validation failed: '

export function fieldValidationError(issues: FieldIssue[]) {
  return new Error(prefix + JSON.stringify(issues))
}

export function fieldValidationIssues(
  error: unknown,
): FieldIssue[] | undefined {
  if (!(error instanceof Error) || !error.message.startsWith(prefix)) return
  try {
    const value: unknown = JSON.parse(error.message.slice(prefix.length))
    if (
      Array.isArray(value) &&
      value.length &&
      value.every(
        (issue: unknown) =>
          typeof issue === 'object' &&
          issue !== null &&
          'path' in issue &&
          typeof issue.path === 'string' &&
          'message' in issue &&
          typeof issue.message === 'string',
      )
    )
      return value as FieldIssue[]
  } catch {
    /* Unrecognized operation failures use the ordinary error UI. */
  }
}
