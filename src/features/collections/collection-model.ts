import type { JsonObject, JsonValue } from '#/lib/json'

export interface CollectionColumn {
  path: string
  label: string
  type: string
  field: JsonObject
}

export interface CollectionViewModel {
  columns: CollectionColumn[]
  primary: string
  searchFields: string[]
  sortFields: string[]
  foldersFirst: boolean
  layout: 'list' | 'tree'
  initial: {
    search: string
    sorting: Array<{ id: string; desc: boolean }>
  }
}

const compactColumnTypes = new Set(['image', 'boolean', 'date', 'datetime'])

export function collectionFluidColumn(model: CollectionViewModel) {
  return (
    model.columns.find(({ path }) => path === model.primary)?.path ??
    model.columns.find(({ type }) => !compactColumnTypes.has(type))?.path ??
    model.columns[0]?.path
  )
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function fields(value: unknown): JsonObject[] {
  return Array.isArray(value) ? value.filter(isObject) : []
}

function strings(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && !!item)
    : []
}

function fieldAtPath(
  source: JsonObject[],
  path: string,
): JsonObject | undefined {
  const [name, ...rest] = path.split('.')
  const field = source.find((candidate) => candidate.name === name)
  if (!field) return
  return rest.length
    ? field.type === 'object'
      ? fieldAtPath(fields(field.fields), rest.join('.'))
      : undefined
    : field
}

function firstFieldPath(
  source: JsonObject[],
  predicate: (field: JsonObject) => boolean,
  prefix = '',
): string | undefined {
  for (const field of source) {
    if (typeof field.name !== 'string') continue
    const path = prefix ? `${prefix}.${field.name}` : field.name
    if (predicate(field)) return path
    if (field.type === 'object') {
      const nested = firstFieldPath(fields(field.fields), predicate, path)
      if (nested) return nested
    }
  }
}

function syntheticField(path: string): JsonObject | undefined {
  if (path === 'date') {
    return { name: 'date', label: 'Date', type: 'date' }
  }
  if (path === 'name') {
    return { name: 'name', label: 'Name', type: 'string' }
  }
}

function column(path: string, field: JsonObject): CollectionColumn {
  const name = typeof field.name === 'string' ? field.name : path
  return {
    path,
    label: typeof field.label === 'string' && field.label ? field.label : name,
    type: typeof field.type === 'string' ? field.type : 'string',
    field,
  }
}

export function collectionViewModel({
  fields: sourceValue,
  filename,
  view: viewValue,
}: {
  fields: unknown
  filename?: unknown
  view: unknown
}): CollectionViewModel {
  const source = fields(sourceValue)
  const view = isObject(viewValue) ? viewValue : {}
  const requested = strings(view.fields)
  const columns = requested.length
    ? requested.flatMap((path) => {
        const field = fieldAtPath(source, path) ?? syntheticField(path)
        return field && field.type !== 'object' && field.type !== 'block'
          ? [column(path, field)]
          : []
      })
    : source.flatMap((field) =>
        field.hidden !== true &&
        field.type !== 'object' &&
        field.type !== 'block' &&
        typeof field.name === 'string'
          ? [column(field.name, field)]
          : [],
      )

  if (!columns.length) {
    columns.push(column('name', syntheticField('name')!))
  }

  const usesDatedFilenames =
    typeof filename === 'string' && filename.startsWith('{year}-{month}-{day}')
  if (
    usesDatedFilenames &&
    !requested.length &&
    !columns.some(({ path }) => path === 'date')
  ) {
    columns.push(column('date', syntheticField('date')!))
  }

  const configuredPrimary =
    typeof view.primary === 'string' ? view.primary : undefined
  const primary =
    configuredPrimary ??
    firstFieldPath(source, (field) => field.name === 'title') ??
    firstFieldPath(
      source,
      (field) => field.type !== 'object' && field.type !== 'block',
    ) ??
    'name'
  const defaultValue = isObject(view.default) ? view.default : {}
  const configuredSort = strings(view.sort)
  const sortFields = configuredSort.length
    ? configuredSort
    : columns.map(({ path }) => path)
  const initialSort =
    typeof defaultValue.sort === 'string'
      ? defaultValue.sort
      : usesDatedFilenames && columns.some(({ path }) => path === 'date')
        ? 'date'
        : (sortFields[0] ?? primary)

  return {
    columns,
    primary,
    searchFields: strings(view.search).length
      ? strings(view.search)
      : columns.map(({ path }) => path),
    sortFields,
    foldersFirst: view.foldersFirst === true,
    layout: view.layout === 'tree' ? 'tree' : 'list',
    initial: {
      search:
        typeof defaultValue.search === 'string' ? defaultValue.search : '',
      sorting: initialSort
        ? [
            {
              id: initialSort,
              desc:
                defaultValue.order === 'desc' ||
                (defaultValue.order == null && initialSort === 'date'),
            },
          ]
        : [],
    },
  }
}

export function collectionValue(
  value: JsonValue,
  path: string,
): JsonValue | undefined {
  let current: JsonValue | undefined = value
  for (const segment of path.split('.')) {
    if (!isObject(current)) return
    current = current[segment]
  }
  return current
}

function searchableValue(value: JsonValue | undefined): string[] {
  if (value === undefined || value === null) return []
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return [String(value)]
  }
  if (Array.isArray(value)) return value.flatMap(searchableValue)
  return Object.values(value).flatMap(searchableValue)
}

export function rowSearchValue(value: JsonValue, paths: string[]) {
  return paths
    .flatMap((path) => searchableValue(collectionValue(value, path)))
    .join(' ')
}
