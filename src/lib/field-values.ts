import type { JsonObject, JsonValue } from './json'

type Field = Record<string, unknown> & { name?: unknown; type?: unknown }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

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
  if (!isRecord(field.options) || !Array.isArray(field.options.values))
    return []
  return field.options.values.flatMap((value): JsonValue[] => {
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      return [value]
    }
    if (isRecord(value) && 'value' in value) {
      const option = value.value
      if (
        typeof option === 'string' ||
        typeof option === 'number' ||
        typeof option === 'boolean'
      ) {
        return [option]
      }
    }
    return []
  })
}

function validateScalar(field: Field, value: JsonValue, path: string) {
  if (field.type === 'number' && typeof value !== 'number') {
    return `${path} must be a number`
  }
  if (field.type === 'boolean' && typeof value !== 'boolean') {
    return `${path} must be true or false`
  }
  if (field.type === 'object') {
    if (!isRecord(value)) return `${path} must be an object`
    return validateStructuredContent(
      Array.isArray(field.fields) ? field.fields : [],
      value,
      path,
    )[0]
  }
  if (field.type === 'block') {
    if (!isRecord(value)) return `${path} must be an object`
    const blockKey =
      typeof field.blockKey === 'string' ? field.blockKey : '_block'
    const blockName = value[blockKey]
    if (typeof blockName !== 'string' || !blockName) {
      return `${path} must select a block type`
    }
    const block = Array.isArray(field.blocks)
      ? field.blocks.find(
          (candidate) => isRecord(candidate) && candidate.name === blockName,
        )
      : undefined
    if (!isRecord(block)) return `${path} uses an unknown block type`
    return validateStructuredContent(
      Array.isArray(block.fields) ? block.fields : [],
      value,
      path,
    )[0]
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
    if (allowed.length && !allowed.includes(value)) {
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
      return `${path} has an invalid format`
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

export function validateStructuredContent(
  fields: unknown[],
  content: JsonObject,
  parentPath = '',
) {
  const errors: string[] = []
  for (const candidate of fields) {
    if (!isRecord(candidate) || typeof candidate.name !== 'string') continue
    const field = candidate as Field
    const path = parentPath ? `${parentPath}.${candidate.name}` : candidate.name
    const value = content[candidate.name]
    if (isEmpty(value)) {
      if (field.required === true) errors.push(`${path} is required`)
      continue
    }
    const options = isRecord(field.options) ? field.options : {}
    if (
      (field.type === 'image' || field.type === 'file') &&
      options.multiple &&
      !field.list
    ) {
      if (
        !Array.isArray(value) ||
        value.some((item) => typeof item !== 'string')
      ) {
        errors.push(`${path} must be a list of file paths`)
      }
      continue
    }
    if (field.list) {
      if (!Array.isArray(value)) {
        errors.push(`${path} must be a list`)
        continue
      }
      const limits = listLimits(field.list)
      if (limits.min !== undefined && value.length < limits.min) {
        errors.push(`${path} requires at least ${limits.min} items`)
      }
      if (limits.max !== undefined && value.length > limits.max) {
        errors.push(`${path} allows at most ${limits.max} items`)
      }
      for (const item of value) {
        const error = validateScalar(field, item, path)
        if (error) errors.push(error)
      }
      continue
    }
    const error = validateScalar(field, value, path)
    if (error) errors.push(error)
  }
  return errors
}

export function validateStructuredList(
  fields: unknown[],
  content: JsonValue[],
  list: unknown = true,
) {
  const errors: string[] = []
  const limits = listLimits(list)
  if (limits.min !== undefined && content.length < limits.min) {
    errors.push(`Content requires at least ${limits.min} items`)
  }
  if (limits.max !== undefined && content.length > limits.max) {
    errors.push(`Content allows at most ${limits.max} items`)
  }
  content.forEach((item, index) => {
    if (!isRecord(item)) {
      errors.push(`Item ${index + 1} must be an object`)
      return
    }
    errors.push(...validateStructuredContent(fields, item, `Item ${index + 1}`))
  })
  return errors
}

export function initializeStructuredContent(fields: unknown[]) {
  const content: JsonObject = {}
  for (const candidate of fields) {
    if (!isRecord(candidate) || typeof candidate.name !== 'string') continue
    let value: unknown = candidate.default
    if (value === undefined) {
      if (candidate.list) value = []
      else if (
        (candidate.type === 'image' || candidate.type === 'file') &&
        isRecord(candidate.options) &&
        candidate.options.multiple
      ) {
        value = []
      } else if (candidate.type === 'boolean') value = false
      else if (candidate.type === 'uuid') value = crypto.randomUUID()
      else if (candidate.type === 'object') {
        value = initializeStructuredContent(
          Array.isArray(candidate.fields) ? candidate.fields : [],
        )
      } else if (candidate.type === 'block') {
        const block = Array.isArray(candidate.blocks)
          ? candidate.blocks.find(isRecord)
          : undefined
        const blockKey =
          typeof candidate.blockKey === 'string' ? candidate.blockKey : '_block'
        const blockName =
          block && typeof block.name === 'string' ? block.name : ''
        value = {
          [blockKey]: blockName,
          ...initializeStructuredContent(
            block && Array.isArray(block.fields) ? block.fields : [],
          ),
        }
      }
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
