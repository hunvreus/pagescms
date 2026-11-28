import { isRecord } from '#/shared/json'
import { containsControlCharacter } from '#/shared/git-path'

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
    const nested =
      value.type === 'object' && !value.list
        ? nestedFieldPath(value.fields, predicate, path)
        : undefined
    if (nested) return nested
  }
}

export function getContentPrimaryField(schema: Record<string, unknown>) {
  const view = isRecord(schema.view) ? schema.view : undefined
  if (typeof view?.primary === 'string') return view.primary
  const suitable = (field: Record<string, unknown>) =>
    !field.list &&
    ['string', 'text', 'number', 'date'].includes(
      String(field.type ?? 'string'),
    )
  for (const name of ['title', 'name', 'label']) {
    const path = nestedFieldPath(
      schema.fields,
      (field) => field.name === name && suitable(field),
    )
    if (path) return path
  }
  return nestedFieldPath(schema.fields, suitable)
}

export function slugifyFilenameValue(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
}

export function filenamePathIssue(path: string, allowSubfolders: boolean) {
  const segments = path.split('/')
  if (
    segments.some(
      (segment) => !segment || segment === '.' || segment === '..',
    ) ||
    path.includes('\\') ||
    /^[A-Za-z]:/.test(path) ||
    containsControlCharacter(path)
  ) {
    return 'Filename template must produce a relative path with valid, non-empty segments'
  }
  if (segments.length > 1 && !allowSubfolders)
    return 'This collection does not allow subfolders'
}

export function generateContentFilename(
  pattern: string,
  schema: Record<string, unknown>,
  content: Record<string, unknown>,
  now = new Date(),
) {
  const pad = (value: number) => String(value).padStart(2, '0')
  const primary = getContentPrimaryField(schema)
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
  const issue = filenamePathIssue(filename, schema.subfolders !== false)
  if (issue) throw new Error(issue)
  return filename
}
