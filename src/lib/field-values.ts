import { isRecord } from '#/shared/json'
import type { JsonObject, JsonValue } from '#/shared/json'
import { selectOptions } from './select-options'
import { defaultDateValue, transformDateValue } from './date-field'
import { customFieldDefinition } from '#/fields/registry'
import { multipleFieldLimits, normalizeFieldValue } from './field-value-shapes'

type Field = Record<string, unknown> & { name?: unknown; type?: unknown }

function isEmpty(value: JsonValue | undefined) {
  return (
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  )
}

function listLimits(value: unknown) {
  return isRecord(value)
    ? {
        min: typeof value.min === 'number' ? value.min : undefined,
        max: typeof value.max === 'number' ? value.max : undefined,
      }
    : {}
}

function selectValues(field: Field) {
  return selectOptions(field).map((option) => option.value)
}

function validatesAsMultiple(field: Field) {
  return (
    isRecord(field.options) &&
    Boolean(field.options.multiple) &&
    ['select', 'reference', 'image', 'file'].includes(String(field.type))
  )
}

function isValidCalendarDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

function validateScalar(field: Field, value: JsonValue, path: string) {
  const custom = customFieldDefinition(String(field.type ?? field.component))
  if (custom) {
    if (!custom.schema) return
    const result = custom.schema(field as JsonObject).safeParse(value)
    return result.success
      ? undefined
      : `${path}: ${result.error?.issues[0]?.message ?? 'Invalid value'}`
  }
  if (
    ![
      'string',
      'text',
      'number',
      'boolean',
      'object',
      'block',
      'uuid',
      'date',
      'select',
      'reference',
      'image',
      'file',
      'rich-text',
      'code',
    ].includes(String(field.type))
  )
    return `${path} uses an unregistered field type: ${String(field.type ?? field.component)}`
  if (field.type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return `${path} must be a number`
    }
    if (isRecord(field.options)) {
      if (typeof field.options.min === 'number' && value < field.options.min) {
        return `${path} must be at least ${field.options.min}`
      }
      if (typeof field.options.max === 'number' && value > field.options.max) {
        return `${path} must be at most ${field.options.max}`
      }
    }
  }
  if (field.type === 'boolean' && typeof value !== 'boolean') {
    return `${path} must be true or false`
  }
  if (
    field.type === 'uuid' &&
    (typeof value !== 'string' ||
      (![
        '00000000-0000-0000-0000-000000000000',
        'ffffffff-ffff-ffff-ffff-ffffffffffff',
      ].includes(value.toLowerCase()) &&
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          value,
        )))
  ) {
    return `${path} must be a valid UUID`
  }
  if (field.type === 'date' && typeof value === 'string') {
    const options = isRecord(field.options) ? field.options : {}
    const pattern = options.time
      ? /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/
      : /^\d{4}-\d{2}-\d{2}$/
    if (
      !pattern.test(value) ||
      !isValidCalendarDate(value) ||
      Number.isNaN(Date.parse(value))
    ) {
      return `${path} must be a valid date`
    }
    if (typeof options.min === 'string' && value < options.min) {
      return `${path} must be on or after ${options.min}`
    }
    if (typeof options.max === 'string' && value > options.max) {
      return `${path} must be on or before ${options.max}`
    }
  }
  if (
    typeof field.type === 'string' &&
    !['number', 'boolean', 'object', 'block'].includes(field.type) &&
    typeof value !== 'string'
  ) {
    return `${path} must be text`
  }
  if (field.type === 'select') {
    const allowed = selectValues(field)
    if (!allowed.includes(String(value))) {
      return `${path} must use a configured option`
    }
  }
  if (typeof value === 'string' && field.pattern) {
    const pattern =
      typeof field.pattern === 'string'
        ? field.pattern
        : isRecord(field.pattern) && typeof field.pattern.regex === 'string'
          ? field.pattern.regex
          : undefined
    if (pattern && !new RegExp(pattern).test(value)) {
      return isRecord(field.pattern) &&
        typeof field.pattern.message === 'string'
        ? `${path}: ${field.pattern.message}`
        : `${path} has an invalid format`
    }
  }
  if (typeof value === 'string' && isRecord(field.options)) {
    if (
      typeof field.options.minlength === 'number' &&
      value.length < field.options.minlength
    ) {
      return `${path} is too short`
    }
    if (
      typeof field.options.maxlength === 'number' &&
      value.length > field.options.maxlength
    ) {
      return `${path} is too long`
    }
  }
}

export interface FieldIssue {
  path: string
  message: string
}

function emptyObject(value: JsonValue): boolean {
  if (isEmpty(value)) return true
  if (Array.isArray(value)) return value.every(emptyObject)
  return (
    isRecord(value) && Object.values(value).every((item) => emptyObject(item))
  )
}

function fieldIssues(
  field: Field,
  raw: JsonValue | undefined,
  path: string,
): FieldIssue[] {
  if (field.localized === true) {
    const entries = isRecord(raw)
      ? Object.entries(raw).filter(
          ([code]) =>
            !Array.isArray(field._localeCodes) ||
            field._localeCodes.includes(code),
        )
      : []
    if (raw === undefined || (isRecord(raw) && !entries.length))
      return field.required === true || field._requireTranslation === true
        ? [{ path, message: `${path} requires a translation` }]
        : []
    if (!isRecord(raw))
      return [{ path, message: `${path} must be an object keyed by locale` }]
    return entries.flatMap(([locale, value]) =>
      fieldIssues({ ...field, localized: false }, value, `${path}.${locale}`),
    )
  }
  if (
    field.required !== true &&
    (raw === undefined || raw === null || raw === '')
  )
    return []
  const custom = customFieldDefinition(String(field.type ?? field.component))
  const value = field.list || custom ? raw : normalizeFieldValue(field, raw)
  const issue = (message: string): FieldIssue[] => [{ path, message }]
  if (isEmpty(value) && field.required === true)
    return issue(`${path} is required`)
  if (value === undefined || value === null || value === '') return []
  if (field.list) {
    if (!Array.isArray(value)) return issue(`${path} must be a list`)
    const errors: FieldIssue[] = []
    const limits = listLimits(field.list)
    if (limits.min !== undefined && value.length < limits.min)
      errors.push(...issue(`${path} requires at least ${limits.min} items`))
    if (limits.max !== undefined && value.length > limits.max)
      errors.push(...issue(`${path} allows at most ${limits.max} items`))
    value.forEach((item, index) => {
      const itemPath = `${path}.${index}`
      const nested = fieldIssues(
        {
          ...field,
          list: false,
          required: field.type === 'object' ? true : field.required,
        },
        item,
        itemPath,
      )
      if (emptyObject(item) && !nested.length)
        errors.push({
          path: itemPath,
          message: `${itemPath} is empty; enter a value or remove this item`,
        })
      else errors.push(...nested)
    })
    return errors
  }
  if (!custom && validatesAsMultiple(field)) {
    if (!Array.isArray(value))
      return issue(
        `${path} must be a list of ${field.type === 'image' || field.type === 'file' ? 'file paths' : 'valid values'}`,
      )
    const errors: FieldIssue[] = []
    const limits = multipleFieldLimits(field)
    if (limits.min !== undefined && value.length < limits.min)
      errors.push(
        ...issue(`${path} requires at least ${limits.min} selections`),
      )
    if (limits.max !== undefined && value.length > limits.max)
      errors.push(...issue(`${path} allows at most ${limits.max} selections`))
    value.forEach((item, index) => {
      const itemPath = `${path}.${index}`
      if (typeof item !== 'string' || !item)
        errors.push({
          path: itemPath,
          message: `${itemPath} must be a non-empty value`,
        })
      else {
        const error = validateScalar(field, item, itemPath)
        if (error) errors.push({ path: itemPath, message: error })
      }
    })
    return errors
  }
  if (custom) {
    const error = validateScalar(field, value, path)
    return error ? issue(error) : []
  }
  if (field.type === 'object' || field.type === 'block') {
    if (!isRecord(value)) return issue(`${path} must be an object`)
    if (field.type === 'object') {
      if (!field.required && emptyObject(value)) return []
      return structuredContentIssues(
        Array.isArray(field.fields) ? field.fields : [],
        value,
        path,
      )
    }
    const blockKey =
      typeof field.blockKey === 'string' ? field.blockKey : '_block'
    const blockName = value[blockKey]
    if (typeof blockName !== 'string' || !blockName)
      return issue(`${path} must select a block type`)
    const block = Array.isArray(field.blocks)
      ? field.blocks.find((item) => isRecord(item) && item.name === blockName)
      : undefined
    if (!isRecord(block)) return issue(`${path} uses an unknown block type`)
    return structuredContentIssues(
      Array.isArray(block.fields) ? block.fields : [],
      value,
      path,
    )
  }
  const error = validateScalar(field, value, path)
  return error ? issue(error) : []
}

export function structuredContentIssues(
  fields: unknown[],
  content: JsonObject,
  parentPath = '',
): FieldIssue[] {
  return fields.flatMap((field) => {
    if (!isRecord(field) || typeof field.name !== 'string') return []
    const path = parentPath ? `${parentPath}.${field.name}` : field.name
    return fieldIssues(field, content[field.name], path)
  })
}

export function structuredListIssues(
  fields: unknown[],
  content: JsonValue[],
  list: unknown = true,
): FieldIssue[] {
  const errors: FieldIssue[] = []
  const limits = listLimits(list)
  if (limits.min !== undefined && content.length < limits.min)
    errors.push({
      path: 'items',
      message: `Content requires at least ${limits.min} items`,
    })
  if (limits.max !== undefined && content.length > limits.max)
    errors.push({
      path: 'items',
      message: `Content allows at most ${limits.max} items`,
    })
  content.forEach((item, index) => {
    if (!isRecord(item))
      errors.push({
        path: `items.${index}`,
        message: `Item ${index + 1} must be an object`,
      })
    else {
      const nested = structuredContentIssues(fields, item, `items.${index}`)
      if (emptyObject(item) && !nested.length)
        errors.push({
          path: `items.${index}`,
          message: `Item ${index + 1} is empty; enter a value or remove this item`,
        })
      else errors.push(...nested)
    }
  })
  return errors
}

function normalizedDefault(field: Field, value: JsonValue): JsonValue {
  if (field.list && Array.isArray(value))
    return value.map((item) =>
      normalizedDefault({ ...field, list: false }, item),
    )
  if (customFieldDefinition(String(field.type ?? field.component)))
    return structuredClone(value)
  if (field.type === 'date')
    return transformDateValue(value, field, 'read') as JsonValue
  if (!isRecord(value)) return structuredClone(value)
  let fields = field.fields
  if (field.type === 'block') {
    const key = typeof field.blockKey === 'string' ? field.blockKey : '_block'
    const block = Array.isArray(field.blocks)
      ? field.blocks.find((item) => isRecord(item) && item.name === value[key])
      : undefined
    fields = isRecord(block) ? block.fields : undefined
  }
  const result = structuredClone(value)
  for (const child of Array.isArray(fields) ? fields : []) {
    if (
      isRecord(child) &&
      typeof child.name === 'string' &&
      child.name in result
    )
      result[child.name] = normalizedDefault(child, result[child.name])
  }
  return result
}

export function initializeStructuredContent(fields: unknown[]) {
  const content: JsonObject = {}
  for (const candidate of fields) {
    if (!isRecord(candidate) || typeof candidate.name !== 'string') continue
    if (candidate.localized === true) {
      content[candidate.name] = {}
      continue
    }
    let value: unknown =
      candidate.list &&
      isRecord(candidate.list) &&
      candidate.list.default !== undefined
        ? candidate.list.default
        : candidate.default
    if (value !== undefined)
      value = normalizedDefault(candidate, value as JsonValue)
    if (value === undefined) {
      const custom = customFieldDefinition(
        String(candidate.type ?? candidate.component),
      )
      const customDefault = custom?.defaultValue
      if (candidate.list) {
        value =
          isRecord(candidate.list) && candidate.list.default !== undefined
            ? candidate.list.default
            : []
      } else if (customDefault !== undefined) {
        value =
          typeof customDefault === 'function'
            ? customDefault(candidate as JsonObject)
            : structuredClone(customDefault)
      } else if (custom) {
        // An override owns its scalar defaults, including choosing none.
        value = undefined
      } else if (validatesAsMultiple(candidate)) {
        value = []
      } else if (candidate.type === 'boolean') value = false
      else if (candidate.type === 'uuid') value = crypto.randomUUID()
      else if (candidate.type === 'date') value = defaultDateValue(candidate)
      else if (candidate.type === 'object') {
        value = initializeStructuredContent(
          Array.isArray(candidate.fields) ? candidate.fields : [],
        )
      } else if (candidate.type === 'block') value = null
    }
    if (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      Array.isArray(value) ||
      isRecord(value)
    ) {
      content[candidate.name] = value as JsonValue
    }
  }
  return content
}

function sanitizedValue(value: JsonValue): JsonValue | undefined {
  if (value === null || value === '') return undefined
  if (Array.isArray(value)) {
    const items = value.flatMap((item) => {
      const sanitized = sanitizedValue(item)
      return sanitized === undefined ? [] : [sanitized]
    })
    return items.length ? items : undefined
  }
  if (isRecord(value)) {
    const result: JsonObject = {}
    for (const [key, child] of Object.entries(value)) {
      const sanitized = sanitizedValue(child)
      if (sanitized !== undefined) result[key] = sanitized
    }
    return Object.keys(result).length ? result : undefined
  }
  return value
}

export function sanitizeStructuredContent(value: JsonValue): JsonValue {
  return sanitizedValue(value) ?? (Array.isArray(value) ? [] : {})
}
