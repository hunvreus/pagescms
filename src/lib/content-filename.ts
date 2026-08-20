import { normalizeGitPath } from './git-path'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function valueAtPath(value: Record<string, unknown>, path: string) {
  let current: unknown = value
  for (const segment of path.split('.')) {
    if (!isRecord(current)) return
    current = current[segment]
  }
  return current
}

function nestedFieldPath(
  fields: unknown,
  predicate: (field: Record<string, unknown>) => boolean,
  parent = '',
): string | undefined {
  if (!Array.isArray(fields)) return
  for (const value of fields) {
    if (!isRecord(value) || typeof value.name !== 'string') continue
    const path = parent ? `${parent}.${value.name}` : value.name
    if (predicate(value)) return path
    const nested = nestedFieldPath(value.fields, predicate, path)
    if (nested) return nested
  }
}

function primaryField(schema: Record<string, unknown>) {
  const view = isRecord(schema.view) ? schema.view : undefined
  if (typeof view?.primary === 'string') return view.primary
  return (
    nestedFieldPath(schema.fields, (field) => field.name === 'title') ??
    nestedFieldPath(
      schema.fields,
      (field) => field.type !== 'object' && field.type !== 'block',
    )
  )
}

export function slugifyFilenameValue(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function generateContentFilename(
  pattern: string,
  schema: Record<string, unknown>,
  content: Record<string, unknown>,
  now = new Date(),
) {
  const pad = (value: number) => String(value).padStart(2, '0')
  const primary = primaryField(schema)
  const dated = pattern
    .replace(/\{year\}/g, String(now.getUTCFullYear()))
    .replace(/\{month\}/g, pad(now.getUTCMonth() + 1))
    .replace(/\{day\}/g, pad(now.getUTCDate()))
    .replace(/\{hour\}/g, pad(now.getUTCHours()))
    .replace(/\{minute\}/g, pad(now.getUTCMinutes()))
    .replace(/\{second\}/g, pad(now.getUTCSeconds()))
    .replace(
      /\{(?:primary|slug)\}/g,
      primary ? `{fields.${primary}}` : 'untitled',
    )
  const filename = dated.replace(
    /\{(?:fields\.)?([^}]+)\}/g,
    (_match, path: string) => {
      const value = valueAtPath(content, path)
      return value == null ? '' : slugifyFilenameValue(String(value))
    },
  )
  if (!filename || filename.includes('/')) {
    throw new Error('Generated filename must be a non-empty file name')
  }
  return normalizeGitPath(filename)
}
