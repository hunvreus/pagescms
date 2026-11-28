import {
  findContentSchema,
  findMediaSchema,
  configuredMediaSchemas,
} from '#/shared/configuration-content'
import { getConfigurationNavigation } from '#/shared/configuration-navigation'
import { getFileExtension } from './file-types'

export const activityRetention = 50
export const activityPageSize = 10

export type ActivityKind =
  | 'added'
  | 'edited'
  | 'uploaded'
  | 'deleted'
  | 'renamed'
  | 'invited'
  | 'removed'
  | 'updated'
  | 'run'
export type ActivityArea =
  | 'collection'
  | 'file'
  | 'media'
  | 'configuration'
  | 'collaborator'
  | 'permissions'
  | 'action'
export type ActivityTarget = { area: ActivityArea; resource: string }
export type ActivityItem = ActivityTarget & {
  id: string
  kind: ActivityKind
  path: string
  previousPath: string | null
  actor: string | null
  actorImage?: string | null
  title?: string | null
  occurredAt: string
}

const within = (path: string, root: string) =>
  !root || path.startsWith(`${root}/`)

// Match the configured file universe, never a filtered directory listing or cache completeness.
export function activityTarget(
  configuration: Record<string, unknown> | null,
  path: string,
  preferred?: { area: string; resource: string },
): ActivityTarget | null {
  if (configuration && preferred && preferred.area !== 'configuration') {
    if (preferred.area === 'media') {
      const schema = findMediaSchema(configuration, preferred.resource)
      return schema
        ? createActivityMatcher({ content: [], media: [schema] })(path)
        : null
    }
    if (preferred.area === 'collection' || preferred.area === 'file') {
      const schema = findContentSchema(configuration, preferred.resource)
      return schema?.type === preferred.area
        ? createActivityMatcher({ content: [schema] })(path)
        : null
    }
    return null
  }
  return createActivityMatcher(configuration)(path)
}

export function createActivityMatcher(
  configuration: Record<string, unknown> | null,
) {
  const schemas = configuration
    ? getConfigurationNavigation({ content: configuration.content })
        .filter((item) => item.type !== 'media')
        .flatMap((item) => findContentSchema(configuration, item.name) ?? [])
        .sort((a, b) => b.path.length - a.path.length)
    : []
  const media = configuration
    ? configuredMediaSchemas(configuration).sort(
        (a, b) => b.input.length - a.input.length,
      )
    : []
  return (path: string): ActivityTarget | null => {
    if (path === '.pages.yml') return { area: 'configuration', resource: '' }
    if (
      !configuration ||
      path.split('/').some((part) => part === '.gitkeep' || part === '.git')
    )
      return null
    for (const schema of schemas) {
      if (schema.type === 'file' && schema.path === path)
        return { area: 'file', resource: schema.name }
      if (schema.type !== 'collection' || !within(path, schema.path)) continue
      const relative = schema.path ? path.slice(schema.path.length + 1) : path
      if (schema.subfolders === false && relative.includes('/')) continue
      const excluded = Array.isArray(schema.exclude) ? schema.exclude : []
      if (relative.split('/').some((part) => excluded.includes(part))) continue
      if (
        typeof schema.extension === 'string' &&
        schema.extension &&
        getFileExtension(path) !== schema.extension
      )
        continue
      return { area: 'collection', resource: schema.name }
    }
    for (const schema of media) {
      if (
        within(path, schema.input) &&
        (!schema.extensions.length ||
          schema.extensions
            .map((extension) => extension.replace(/^\./, '').toLowerCase())
            .includes(getFileExtension(path).toLowerCase()))
      ) {
        return { area: 'media', resource: schema.name }
      }
    }
    return null
  }
}
