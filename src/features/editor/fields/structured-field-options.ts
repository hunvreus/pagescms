import type { JsonObject, JsonValue } from '#/lib/json'

function isRecord(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function access(value: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, part) => {
    if (!isRecord(current)) return undefined

    const match = /^(.*)\[(\d+)]$/.exec(part)
    if (!match) return current[part]

    const collection = current[match[1]]
    return Array.isArray(collection) ? collection[Number(match[2])] : undefined
  }, value)
}

function interpolate(template: string, fields: JsonValue, index: number) {
  const data: JsonObject = {
    index: String(index + 1),
    fields,
  }

  return template
    .replace(/(?<!\\)\{([^}]+)\}/g, (_match, token: string) => {
      const direct = access(data, token)
      const value =
        direct === undefined ? access(data, `fields.${token}`) : direct
      return value === undefined || value === null ? '' : String(value)
    })
    .replace(/\\([{}])/g, '$1')
}

export function getListFieldOptions(field: JsonObject) {
  const list = isRecord(field.list) ? field.list : {}
  const supportsCollapse = field.type === 'object' || field.type === 'block'
  const collapsibleSetting = list.collapsible
  const collapsible =
    supportsCollapse && field.list !== false && collapsibleSetting !== false

  return {
    min: typeof list.min === 'number' ? list.min : 0,
    max: typeof list.max === 'number' ? list.max : Number.POSITIVE_INFINITY,
    collapsible,
    initiallyCollapsed:
      collapsible &&
      isRecord(collapsibleSetting) &&
      collapsibleSetting.collapsed === true,
    summary:
      collapsible &&
      isRecord(collapsibleSetting) &&
      typeof collapsibleSetting.summary === 'string'
        ? collapsibleSetting.summary
        : null,
  }
}

export function getListItemSummary(
  field: JsonObject,
  value: JsonValue,
  index: number,
) {
  const { summary } = getListFieldOptions(field)
  return summary ? interpolate(summary, value, index) : `Item #${index + 1}`
}
