import { configurationNameIssues } from '#/shared/configuration-names'
import {
  assertLocalizedFields,
  normalizeContentI18n,
  resolveLocales,
} from '#/lib/i18n'
import { extensionCategories, getFileExtension } from '#/lib/file-types'
import type { ExtensionCategory } from '#/lib/file-types'
import { normalizeGitPath } from '#/shared/git-path'

export const CONFIGURATION_VERSION = '3.9'

type ConfigurationRecord = Record<string, unknown>

type NavigationNode = {
  type: unknown
  name: unknown
  label: unknown
  icon?: string
  items?: NavigationNode[]
}

const CODE_EXTENSIONS = new Set([
  'yaml',
  'yml',
  'javascript',
  'js',
  'jsx',
  'typescript',
  'ts',
  'tsx',
  'json',
  'html',
  'htm',
  'markdown',
  'md',
  'mdx',
])

function isRecord(value: unknown): value is ConfigurationRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function cloneValue<T>(value: T): T {
  return structuredClone(value)
}

function mergeConfigurationRecords(
  base: ConfigurationRecord,
  override: ConfigurationRecord,
): ConfigurationRecord {
  const result = { ...base }

  for (const [key, overrideValue] of Object.entries(override)) {
    const baseValue = result[key]
    result[key] =
      isRecord(baseValue) && isRecord(overrideValue)
        ? mergeConfigurationRecords(baseValue, overrideValue)
        : overrideValue
  }

  return result
}

function resolveComponent(
  field: ConfigurationRecord,
  components: ConfigurationRecord,
  ancestors: readonly string[] = [],
): ConfigurationRecord {
  let result = { ...field }
  const componentKey = result.component

  if (typeof componentKey === 'string') {
    const definition = components[componentKey]
    delete result.component

    if (isRecord(definition)) {
      if (ancestors.includes(componentKey))
        throw new Error(
          `Circular component reference: ${[...ancestors, componentKey].join(' → ')}`,
        )
      const component = resolveComponent(definition, components, [
        ...ancestors,
        componentKey,
      ])
      const originalName = result.name
      const componentType = component.type
      result = mergeConfigurationRecords(component, result)

      if (originalName !== undefined) result.name = originalName
      if (componentType !== undefined) result.type = componentType
    }
  }

  if (
    Array.isArray(result.fields) &&
    result.fields.length > 0 &&
    result.type === undefined
  ) {
    result.type = 'object'
  }

  if (Array.isArray(result.fields)) {
    result.fields = result.fields.map((nestedField) =>
      resolveComponentRecord(nestedField, components, ancestors),
    )
  }

  if (Array.isArray(result.blocks)) {
    result.blocks = result.blocks.map((block) =>
      resolveComponentRecord(block, components, ancestors),
    )
  }

  return result
}

function resolveComponentRecord(
  value: unknown,
  components: ConfigurationRecord,
  ancestors: readonly string[] = [],
) {
  if (!isRecord(value)) {
    throw new Error('Configuration fields and blocks must be objects')
  }
  return resolveComponent(value, components, ancestors)
}

function normalizeMediaConfiguration(value: unknown): ConfigurationRecord[] {
  let media: unknown[]

  if (typeof value === 'string') {
    const input = normalizeGitPath(value)
    media = [
      {
        name: 'default',
        input,
        output: input ? `/${input}` : '/',
      },
    ]
  } else if (isRecord(value)) {
    media = [{ name: 'default', ...value }]
  } else if (Array.isArray(value)) {
    media = value
  } else {
    throw new Error('Media configuration must be a string, object, or array')
  }

  return media.map((item) => {
    if (!isRecord(item)) throw new Error('Media entries must be objects')
    const normalized = { ...item }

    if (typeof normalized.input === 'string') {
      normalized.input = normalizeGitPath(normalized.input)
    }
    if (typeof normalized.output === 'string' && normalized.output !== '/') {
      normalized.output = normalized.output.replace(/\/$/, '')
    }

    if (normalized.categories !== undefined) {
      if (normalized.extensions !== undefined) {
        delete normalized.categories
      } else if (Array.isArray(normalized.categories)) {
        normalized.extensions = normalized.categories.flatMap((category) =>
          typeof category === 'string' && category in extensionCategories
            ? [...extensionCategories[category as ExtensionCategory]]
            : [],
        )
        delete normalized.categories
      }
    }

    return normalized
  })
}

function normalizeContentEntry(
  value: unknown,
  components: ConfigurationRecord,
) {
  if (!isRecord(value)) throw new Error('Content entries must be objects')
  const entry = value

  if (typeof entry.path === 'string') {
    entry.path = normalizeGitPath(entry.path)
  }

  if (entry.type === 'collection' && isRecord(entry.filename)) {
    const template = entry.filename.template
    const filenameField = entry.filename.field
    if (typeof template === 'string') {
      entry.filename = template
      if (
        filenameField === true ||
        filenameField === false ||
        filenameField === 'create'
      ) {
        entry.filenameField = filenameField
      }
    }
  }

  if (entry.filename == null && entry.type === 'collection') {
    const extension =
      typeof entry.extension === 'string' && entry.extension
        ? entry.extension
        : entry.format === 'yaml'
          ? 'yml'
          : entry.format === 'json' || entry.format === 'toml'
            ? entry.format
            : 'md'
    entry.filename = `{year}-{month}-{day}-{primary}.${extension}`
  }

  if (entry.extension == null) {
    const filename = entry.type === 'file' ? entry.path : entry.filename
    if (typeof filename === 'string')
      entry.extension = getFileExtension(filename)
  }

  if (entry.format == null) {
    const fields = entry.fields
    const extension = entry.extension
    entry.format = 'raw'
    if (Array.isArray(fields) && fields.length > 0) {
      if (extension === 'json' || extension === 'toml') entry.format = extension
      else if (extension === 'yaml' || extension === 'yml')
        entry.format = 'yaml'
      else entry.format = 'yaml-frontmatter'
    } else if (
      typeof extension === 'string' &&
      CODE_EXTENSIONS.has(extension)
    ) {
      entry.format = 'code'
    } else if (extension === 'csv') {
      entry.format = 'datagrid'
    }
  }

  if (isRecord(entry.view) && typeof entry.view.node === 'string') {
    entry.view.node = { filename: entry.view.node, hideDirs: 'nodes' }
  }

  if (Array.isArray(entry.fields)) {
    entry.fields = entry.fields.map((field) =>
      resolveComponentRecord(field, components),
    )
  }

  return entry
}

function normalizeContentEntries(
  entries: unknown[],
  components: ConfigurationRecord,
): { items: ConfigurationRecord[]; navigation: NavigationNode[] } {
  const items: ConfigurationRecord[] = []
  const navigation: NavigationNode[] = []

  for (const value of entries) {
    if (!isRecord(value)) throw new Error('Content entries must be objects')

    if (value.type === 'group') {
      const nested = normalizeContentEntries(
        Array.isArray(value.items) ? value.items : [],
        components,
      )
      navigation.push({
        type: 'group',
        name: value.name,
        label: value.label ?? value.name,
        items: nested.navigation,
      })
      items.push(...nested.items)
      continue
    }

    const entry = normalizeContentEntry(value, components)
    items.push(entry)
    navigation.push({
      type: entry.type,
      name: entry.name,
      label: entry.label ?? entry.name,
      ...(typeof entry.icon === 'string' ? { icon: entry.icon } : {}),
    })
  }

  return { items, navigation }
}

export function normalizeConfiguration(
  configuration: unknown,
): ConfigurationRecord {
  if (configuration == null) return {}
  if (!isRecord(configuration)) {
    throw new Error('Configuration root must be an object')
  }

  const nameIssues = configurationNameIssues(configuration)
  if (nameIssues.length)
    throw new Error(nameIssues.map((issue) => issue.message).join('\n'))

  const normalized = cloneValue(configuration)

  if (!isRecord(normalized.settings)) {
    normalized.settings = {}
  }

  const settings = normalized.settings
  if (!isRecord(settings)) throw new Error('Configuration settings are invalid')

  delete normalized.cache
  delete normalized.hide

  const components = isRecord(normalized.components)
    ? normalized.components
    : {}
  if (isRecord(normalized.components)) {
    normalized.components = Object.fromEntries(
      Object.entries(components).map(([key, component]) => [
        key,
        resolveComponentRecord(component, components, [key]),
      ]),
    )
  }

  if (normalized.i18n !== undefined)
    normalized.i18n = resolveLocales(normalized.i18n)

  const navigation: Record<string, NavigationNode[]> = {}

  if (normalized.media !== undefined) {
    normalized.media = normalizeMediaConfiguration(normalized.media)
  }

  if (Array.isArray(normalized.content) && normalized.content.length > 0) {
    const content = normalizeContentEntries(normalized.content, components)
    for (const item of content.items) {
      normalizeContentI18n(item, normalized.i18n)
      assertLocalizedFields(item)
    }
    normalized.content = content.items
    navigation.content = content.navigation
  }

  delete settings.hide

  if (Array.isArray(normalized.media) && normalized.media.length > 0) {
    navigation.media = normalized.media.map((item) => {
      if (!isRecord(item)) throw new Error('Media entries must be objects')
      return {
        type: 'media',
        name: item.name ?? 'default',
        label:
          item.label ??
          (item.name === 'default' ? 'Media' : item.name) ??
          'Media',
        ...(item.label == null && (item.name == null || item.name === 'default')
          ? { defaultLabel: 'media' }
          : {}),
        ...(typeof item.icon === 'string' ? { icon: item.icon } : {}),
      }
    })
  }

  if (Object.keys(navigation).length > 0) normalized.navigation = navigation
  else delete normalized.navigation

  return normalized
}

export {
  isConfigurationEditingEnabled,
  isCacheManagementEnabled,
} from '#/shared/configuration-settings'
