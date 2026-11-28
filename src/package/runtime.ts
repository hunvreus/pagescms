import { isRecord } from '#/plugins/identity'
import type { JsonObject } from '#/shared/json'
import type {
  ClientPlugin,
  FieldDefinition,
  FieldPlugin,
} from '#/plugins/client'

// Browser-safe helpers imported by generated client entries. Core also loads the
// client deployment on the server for field values, so shared modules must stay pure.

export interface SharedPluginContribution {
  configurationSchema?: ClientPlugin['configurationSchema']
  fields?: Readonly<
    Record<string, { definition: FieldDefinition; override?: boolean }>
  >
}

export interface ClientPluginContribution {
  translations?: ClientPlugin['translations']
  errors?: ClientPlugin['errors']
  fields?: Readonly<Record<string, Pick<FieldPlugin, 'editor' | 'view'>>>
  ui?: ClientPlugin['ui']
  repositoryPages?: ClientPlugin['repositoryPages']
  pages?: ClientPlugin['pages']
}

export type SharedPluginModule = (
  publicOptions: JsonObject,
) => SharedPluginContribution
export type ClientPluginModule = (
  publicOptions: JsonObject,
) => ClientPluginContribution

function contribution(
  id: string,
  kind: string,
  factory: unknown,
  publicOptions: JsonObject,
  keys: readonly string[],
): Record<string, unknown> {
  if (factory === undefined) return {}
  if (typeof factory !== 'function')
    throw new Error(`Plugin ${id} ${kind} module must export a default factory`)
  const result: unknown = factory(publicOptions)
  if (!isRecord(result))
    throw new Error(`Plugin ${id} ${kind} module must return an object`)
  const values = result as Record<string, unknown>
  for (const key of Object.keys(values))
    if (!keys.includes(key))
      throw new Error(`Unknown ${kind} contribution ${key} in plugin ${id}`)
  if (values.fields !== undefined && !isRecord(values.fields))
    throw new Error(`Plugin ${id} ${kind} fields must be a record`)
  return values
}

// Joins pure shared field definitions with lazy client components into one
// ClientPlugin; definePagesCmsClientDeployment validates the result.
export function instantiateClientPlugin(
  id: string,
  shared: unknown,
  client: unknown,
  publicOptions: JsonObject,
): ClientPlugin {
  const sharedContribution = contribution(id, 'shared', shared, publicOptions, [
    'fields',
    'configurationSchema',
  ]) as SharedPluginContribution
  const definitions = sharedContribution.fields
  const interfaces = contribution(id, 'client', client, publicOptions, [
    'fields',
    'ui',
    'repositoryPages',
    'pages',
    'translations',
    'errors',
  ]) as ClientPluginContribution
  const fields: Record<string, FieldPlugin> = Object.create(null)
  for (const [name, field] of Object.entries(definitions ?? {})) {
    if (!isRecord(field))
      throw new Error(`Invalid shared field ${name} in plugin ${id}`)
    for (const key of Object.keys(field))
      if (!['definition', 'override'].includes(key))
        throw new Error(`Unknown shared field key ${key} in plugin ${id}`)
    fields[name] = { ...field }
  }
  for (const [name, field] of Object.entries(interfaces.fields ?? {})) {
    if (!Object.hasOwn(fields, name))
      throw new Error(
        `Client field ${name} in plugin ${id} has no shared definition`,
      )
    if (!isRecord(field))
      throw new Error(`Invalid client field ${name} in plugin ${id}`)
    for (const key of Object.keys(field))
      if (!['editor', 'view'].includes(key))
        throw new Error(`Unknown client field key ${key} in plugin ${id}`)
    fields[name] = { ...fields[name], ...field }
  }
  return {
    id,
    ...(interfaces.errors !== undefined ? { errors: interfaces.errors } : {}),
    ...(interfaces.translations !== undefined
      ? { translations: interfaces.translations }
      : {}),
    ...(sharedContribution.configurationSchema
      ? { configurationSchema: sharedContribution.configurationSchema }
      : {}),
    ...(interfaces.repositoryPages
      ? { repositoryPages: interfaces.repositoryPages }
      : {}),
    ...(interfaces.pages ? { pages: interfaces.pages } : {}),
    ...(Object.keys(fields).length ? { fields } : {}),
    ...(interfaces.ui !== undefined ? { ui: interfaces.ui } : {}),
  }
}
