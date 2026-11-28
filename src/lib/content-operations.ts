import { isRecord } from '#/shared/json'

export type ContentOperation = 'create' | 'rename' | 'delete'
export type ContentScope = 'collection' | 'file' | 'settings'
export type ContentOperations = Readonly<Record<ContentOperation, boolean>>

export const contentOperationDefaults: Readonly<
  Record<ContentScope, ContentOperations>
> = {
  collection: { create: true, rename: true, delete: true },
  file: { create: true, rename: false, delete: true },
  settings: { create: true, rename: false, delete: false },
}

type ContentSchema = Readonly<{
  type?: unknown
  operations?: unknown
}>

type ResolveContentOperationsOptions = Readonly<{
  schema?: ContentSchema | null
  scope?: ContentScope
}>

export function resolveContentOperations({
  schema,
  scope,
}: ResolveContentOperationsOptions): ContentOperations {
  const resolvedScope =
    scope ?? (schema?.type === 'file' ? 'file' : 'collection')
  const defaults = contentOperationDefaults[resolvedScope]
  if (schema?.operations === false) {
    return { create: false, rename: false, delete: false }
  }
  const configured = isRecord(schema?.operations) ? schema.operations : {}

  return {
    create: defaults.create && configured.create !== false,
    rename: defaults.rename && configured.rename !== false,
    delete: defaults.delete && configured.delete !== false,
  }
}

export function isContentOperationAllowed(
  operation: ContentOperation,
  options: ResolveContentOperationsOptions,
) {
  return resolveContentOperations(options)[operation]
}
