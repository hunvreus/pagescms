export interface ActionField {
  name: string
  label: string
  type: 'text' | 'textarea' | 'select' | 'checkbox' | 'number'
  required?: boolean
  default?: string | number | boolean
  options?: Array<{ label: string; value: string }>
}

export interface RepositoryAction {
  name: string
  label: string
  workflow: string
  ref?: string
  scope?: 'collection' | 'entry'
  cancelable?: boolean
  confirm?: boolean | { title?: string; message?: string; button?: string }
  fields?: ActionField[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function repositoryActions(configuration: Record<string, unknown>) {
  if (!Array.isArray(configuration.actions)) return []
  return configuration.actions.filter(
    (value): value is RepositoryAction =>
      isRecord(value) &&
      typeof value.name === 'string' &&
      typeof value.label === 'string' &&
      typeof value.workflow === 'string',
  )
}

export function schemaActions(
  schema: Record<string, unknown>,
  scope?: 'collection' | 'entry',
) {
  if (!Array.isArray(schema.actions)) return []
  return schema.actions
    .filter(
      (value): value is RepositoryAction =>
        isRecord(value) &&
        typeof value.name === 'string' &&
        typeof value.label === 'string' &&
        typeof value.workflow === 'string',
    )
    .filter((action) =>
      scope === undefined ? action.scope === undefined : action.scope === scope,
    )
}

export function resolveActionRef(ref: string | undefined, branch: string) {
  return !ref || ref === 'current' ? branch : ref
}

export function validateActionInputs(
  fields: readonly ActionField[],
  values: Record<string, unknown>,
) {
  const result: Record<string, string | number | boolean> = {}
  for (const field of fields) {
    const value = values[field.name] ?? field.default
    if (value === undefined || value === '') {
      if (field.required) throw new Error(`${field.label} is required`)
      continue
    }
    if (field.type === 'checkbox') {
      if (typeof value !== 'boolean')
        throw new Error(`${field.label} must be true or false`)
    } else if (field.type === 'number') {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(`${field.label} must be a number`)
      }
    } else if (typeof value !== 'string') {
      throw new Error(`${field.label} must be text`)
    }
    if (
      field.type === 'select' &&
      field.options?.length &&
      !field.options.some((option) => option.value === value)
    ) {
      throw new Error(`${field.label} must use a configured option`)
    }
    result[field.name] = value
  }
  return result
}
