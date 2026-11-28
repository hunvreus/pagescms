import { isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_EMAIL_PLUGIN_ID, PACKAGE_TARGETS } from './constants'
import type { JsonObject, JsonValue } from '#/shared/json'

// Build descriptors only: reading a config must never import plugin runtime code.

export { DEFAULT_EMAIL_PLUGIN_ID, PACKAGE_TARGETS }
export type { ServerPluginModule } from './runtime.server'
export type { SharedPluginModule, ClientPluginModule } from './runtime'
export type PackageTarget = (typeof PACKAGE_TARGETS)[number]

export interface PluginDescriptorInput {
  id: string
  server?: string | URL
  shared?: string | URL
  client?: string | URL
  targets?: readonly PackageTarget[]
  options?: JsonObject
  publicOptions?: JsonObject
  /** drizzle-kit SQLite output directory; applied to the application database by `migratePackage`. */
  migrations?: string | URL
}

export interface PluginDescriptor {
  readonly id: string
  readonly server?: string
  readonly shared?: string
  readonly client?: string
  readonly targets: readonly PackageTarget[]
  readonly options: JsonObject
  readonly publicOptions: JsonObject
  readonly migrations?: string
}

export interface PackageConfigInput {
  target: PackageTarget
  plugins?: readonly PluginDescriptor[]
}

export interface PackageConfig {
  readonly target: PackageTarget
  readonly plugins: readonly PluginDescriptor[]
}

export class PackageConfigurationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PackageConfigurationError'
  }
}

const DESCRIPTOR_KEYS = [
  'id',
  'server',
  'shared',
  'client',
  'targets',
  'options',
  'publicOptions',
  'migrations',
]
const MODULE_KEYS = ['server', 'shared', 'client'] as const

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function cloneJson(value: unknown, path: string, seen: Set<object>): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value))
      throw new PackageConfigurationError(`${path} must be a finite number`)
    return value
  }
  if (Array.isArray(value) || isPlainObject(value)) {
    if (seen.has(value))
      throw new PackageConfigurationError(`${path} must not be circular`)
    seen.add(value)
    let result: JsonValue
    if (Array.isArray(value)) {
      const items: JsonValue[] = []
      for (let index = 0; index < value.length; index++) {
        if (!Object.hasOwn(value, index))
          throw new PackageConfigurationError(`${path} must not be sparse`)
        items.push(cloneJson(value[index], `${path}[${index}]`, seen))
      }
      result = items
    } else {
      if (Object.getOwnPropertySymbols(value).length)
        throw new PackageConfigurationError(`${path} must not use symbol keys`)
      const object: JsonObject = {}
      for (const [key, item] of Object.entries(value))
        Object.defineProperty(object, key, {
          value: cloneJson(item, `${path}.${key}`, seen),
          enumerable: true,
          writable: true,
          configurable: true,
        })
      result = object
    }
    seen.delete(value)
    return result
  }
  throw new PackageConfigurationError(`${path} must be JSON-serializable`)
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const item of Object.values(value)) deepFreeze(item)
    Object.freeze(value)
  }
  return value
}

// Returns a frozen deep copy, rejecting anything JSON cannot represent exactly.
export function toJsonOptions(value: unknown, path: string): JsonObject {
  if (value === undefined) return Object.freeze({})
  if (!isPlainObject(value))
    throw new PackageConfigurationError(`${path} must be a JSON object`)
  return deepFreeze(cloneJson(value, path, new Set()) as JsonObject)
}

function modulePath(value: unknown, path: string): string {
  let result: string
  if (value instanceof URL) {
    if (value.protocol !== 'file:')
      throw new PackageConfigurationError(`${path} must be a file: URL`)
    result = fileURLToPath(value)
  } else if (typeof value === 'string') {
    result = value.startsWith('file:') ? fileURLToPath(value) : value
  } else {
    throw new PackageConfigurationError(`${path} must be a path or file: URL`)
  }
  if (!isAbsolute(result) || result.includes('\0') || /[\r\n]/.test(result))
    throw new PackageConfigurationError(`${path} must be an absolute file path`)
  return result
}

function isTarget(value: unknown): value is PackageTarget {
  return (PACKAGE_TARGETS as readonly unknown[]).includes(value)
}

export function definePlugin(input: PluginDescriptorInput): PluginDescriptor {
  if (!isPlainObject(input))
    throw new PackageConfigurationError('Plugin descriptor must be an object')
  const id = input.id
  if (typeof id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(id))
    throw new PackageConfigurationError('Invalid plugin ID')
  if (id === DEFAULT_EMAIL_PLUGIN_ID)
    throw new PackageConfigurationError(`Plugin ID ${id} is reserved`)
  for (const key of Object.keys(input))
    if (!DESCRIPTOR_KEYS.includes(key))
      throw new PackageConfigurationError(`Unknown key ${key} in plugin ${id}`)
  const modules: Partial<Record<(typeof MODULE_KEYS)[number], string>> = {}
  for (const key of MODULE_KEYS)
    if (input[key] !== undefined)
      modules[key] = modulePath(input[key], `Plugin ${id} ${key}`)
  if (!Object.keys(modules).length)
    throw new PackageConfigurationError(
      `Plugin ${id} must provide a server, shared or client module`,
    )
  const migrations =
    input.migrations === undefined
      ? undefined
      : modulePath(input.migrations, `Plugin ${id} migrations`)
  // `core` would share the core D1 migration journal name.
  if (migrations && id === 'core')
    throw new PackageConfigurationError(
      'Plugin ID core cannot declare migrations',
    )
  const targets = input.targets ?? PACKAGE_TARGETS
  if (
    !Array.isArray(targets) ||
    !targets.length ||
    !targets.every(isTarget) ||
    new Set(targets).size !== targets.length
  )
    throw new PackageConfigurationError(`Invalid targets in plugin ${id}`)
  return Object.freeze({
    id,
    ...modules,
    ...(migrations ? { migrations } : {}),
    targets: Object.freeze([...targets]),
    options: toJsonOptions(input.options, `Plugin ${id} options`),
    publicOptions: toJsonOptions(
      input.publicOptions,
      `Plugin ${id} publicOptions`,
    ),
  })
}

export function defineConfig(input: PackageConfigInput): PackageConfig {
  if (!isPlainObject(input))
    throw new PackageConfigurationError('Configuration must be an object')
  for (const key of Object.keys(input))
    if (!['target', 'plugins'].includes(key))
      throw new PackageConfigurationError(`Unknown configuration key ${key}`)
  if (!isTarget(input.target))
    throw new PackageConfigurationError(
      `Unsupported target ${String(input.target)}`,
    )
  const target = input.target
  const registered = input.plugins ?? []
  if (!Array.isArray(registered))
    throw new PackageConfigurationError('Plugins must be an array')
  const ids = new Set<string>()
  const plugins = registered.map((descriptor: PluginDescriptor) => {
    // Revalidate: descriptors may come from another copy of this module or be hand-written.
    const plugin = definePlugin(descriptor)
    if (ids.has(plugin.id))
      throw new PackageConfigurationError(`Duplicate plugin: ${plugin.id}`)
    ids.add(plugin.id)
    if (!plugin.targets.includes(target))
      throw new PackageConfigurationError(
        `Plugin ${plugin.id} does not support target ${target}`,
      )
    return plugin
  })
  return Object.freeze({ target, plugins: Object.freeze(plugins) })
}
