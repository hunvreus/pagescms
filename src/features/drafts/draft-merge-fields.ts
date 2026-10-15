import { isContentField } from '#/lib/content-field'

function pathFields(path: string[], fields: unknown) {
  let children = Array.isArray(fields) ? fields : []
  return path.map((name) => {
    const match = children.find(
      (item) => isContentField(item) && item.name === name,
    )
    const field = isContentField(match) ? match : undefined
    children = Array.isArray(field?.fields) ? field.fields : []
    return { name, field }
  })
}
export function mergeField(path: string[], fields: unknown) {
  return pathFields(path, fields).at(-1)?.field
}
export function conflictLabel(path: string[], fields: unknown, label: string) {
  return path.length
    ? pathFields(path, fields)
        .map(({ name, field }) =>
          typeof field?.label === 'string' && field.label ? field.label : name,
        )
        .join(' › ')
    : label
}
