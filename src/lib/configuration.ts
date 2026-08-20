import { extensionCategories, getFileExtension } from './file-types'
import type { ExtensionCategory } from './file-types'
import { normalizeGitPath } from './git-path'

export const CONFIGURATION_VERSION = '3.0'

type ConfigurationRecord = Record<string, unknown>

type NavigationNode = {
  type: unknown
  name: unknown
  label: unknown
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
  const result = cloneValue(base)

  for (const [key, overrideValue] of Object.entries(override)) {
    const baseValue = result[key]
    result[key] =
      isRecord(baseValue) && isRecord(overrideValue)
        ? mergeConfigurationRecords(baseValue, overrideValue)
        : cloneValue(overrideValue)
  }

  return result
}

function migrateCommitConfiguration(value: unknown) {
  if (!isRecord(value)) return

  if (isRecord(value.message) && !isRecord(value.templates)) {
    value.templates = value.message
  }
  delete value.message
}

function resolveComponent(
  field: ConfigurationRecord,
  components: ConfigurationRecord,
): ConfigurationRecord {
  let result = cloneValue(field)
  const componentKey = result.component

  if (typeof componentKey === 'string') {
    const component = components[componentKey]
    delete result.component

    if (isRecord(component)) {
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
      resolveComponentRecord(nestedField, components),
    )
  }

  if (Array.isArray(result.blocks)) {
    result.blocks = result.blocks.map((block) =>
      resolveComponentRecord(block, components),
    )
  }

  return result
}

function resolveComponentRecord(
  value: unknown,
  components: ConfigurationRecord,
) {
  if (!isRecord(value)) {
    throw new Error('Configuration fields and blocks must be objects')
  }
  return resolveComponent(value, components)
}

function normalizeMediaConfiguration(value: unknown): ConfigurationRecord[] {
  let media: unknown[]

  if (typeof value === 'string') {
    const input = normalizeGitPath(value)
    media = [
      {
        name: 'default',
        label: 'Media',
        input,
        output: input ? `/${input}` : '/',
      },
    ]
  } else if (isRecord(value)) {
    media = [{ name: 'default', label: 'Media', ...value }]
  } else if (Array.isArray(value)) {
    media = value
  } else {
    throw new Error('Media configuration must be a string, object, or array')
  }

  return media.map((item) => {
    if (!isRecord(item)) throw new Error('Media entries must be objects')
    const normalized = cloneValue(item)

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

    migrateCommitConfiguration(normalized.commit)
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
    entry.filename = '{year}-{month}-{day}-{primary}.md'
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

  migrateCommitConfiguration(entry.commit)

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

  const normalized = cloneValue(configuration)

  if (normalized.settings === false) {
    normalized.settings = { config: false }
  } else if (!isRecord(normalized.settings)) {
    normalized.settings = {}
  }

  const settings = normalized.settings
  if (!isRecord(settings)) throw new Error('Configuration settings are invalid')

  if (typeof normalized.cache === 'boolean' && settings.cache == null) {
    settings.cache = normalized.cache
  }
  if (typeof normalized.hide === 'boolean' && settings.config == null) {
    settings.config = !normalized.hide
  }
  delete normalized.cache
  delete normalized.hide

  const components = isRecord(normalized.components)
    ? normalized.components
    : {}
  if (isRecord(normalized.components)) {
    for (const [key, component] of Object.entries(normalized.components)) {
      normalized.components[key] = resolveComponentRecord(component, components)
    }
  }

  const navigation: Record<string, NavigationNode[]> = {}

  if (normalized.media) {
    normalized.media = normalizeMediaConfiguration(normalized.media)
  }

  if (Array.isArray(normalized.content) && normalized.content.length > 0) {
    const content = normalizeContentEntries(normalized.content, components)
    normalized.content = content.items
    navigation.content = content.navigation
  }

  if (typeof settings.hide === 'boolean' && settings.config == null) {
    settings.config = !settings.hide
  }
  delete settings.hide
  migrateCommitConfiguration(settings.commit)

  if (Array.isArray(normalized.media) && normalized.media.length > 0) {
    navigation.media = normalized.media.map((item) => {
      if (!isRecord(item)) throw new Error('Media entries must be objects')
      return {
        type: 'media',
        name: item.name ?? 'default',
        label: item.label ?? item.name ?? 'Media',
      }
    })
  }

  if (Object.keys(navigation).length > 0) normalized.navigation = navigation
  else delete normalized.navigation

  return normalized
}

function resolveSettings(configuration?: ConfigurationRecord) {
  return isRecord(configuration?.settings) ? configuration.settings : {}
}

export function isConfigurationEditingEnabled(
  configuration?: ConfigurationRecord,
) {
  const settings = resolveSettings(configuration)
  if (typeof settings.config === 'boolean') return settings.config
  if (typeof settings.hide === 'boolean') return !settings.hide
  return true
}

export function isCacheEnabled(configuration?: ConfigurationRecord) {
  const settings = resolveSettings(configuration)
  if (typeof settings.cache === 'boolean') return settings.cache
  if (typeof configuration?.cache === 'boolean') return configuration.cache
  return false
}
