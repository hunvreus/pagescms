import type { AccessDiscoveryDecision } from '#/server/access-policy.server'
import { toJsonObject } from './json'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function filterNamedValues(
  value: unknown,
  type: 'collection' | 'media' | 'action',
  visible: ReadonlySet<string>,
): unknown {
  if (!Array.isArray(value)) return value
  return value.flatMap((candidate): unknown[] => {
    if (!isRecord(candidate)) return []
    if (candidate.type === 'group') {
      const items = filterNamedValues(candidate.items, type, visible)
      return Array.isArray(items) && items.length
        ? [{ ...candidate, items }]
        : []
    }
    const sanitized =
      type === 'collection' || type === 'media'
        ? {
            ...candidate,
            ...(candidate.actions === undefined
              ? {}
              : {
                  actions: filterNamedValues(
                    candidate.actions,
                    'action',
                    visible,
                  ),
                }),
          }
        : candidate
    const name =
      typeof candidate.name === 'string'
        ? candidate.name
        : type === 'media'
          ? 'default'
          : null
    return name !== null && visible.has(`${type}:${name}`) ? [sanitized] : []
  })
}

function configuredActionNames(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((candidate) => {
    if (!isRecord(candidate)) return []
    if (candidate.type === 'group')
      return configuredActionNames(candidate.items)
    return Array.isArray(candidate.actions)
      ? candidate.actions.flatMap((action) =>
          isRecord(action) && typeof action.name === 'string'
            ? [action.name]
            : [],
        )
      : []
  })
}

export function getConfigurationActionNames(
  configuration: Record<string, unknown>,
) {
  return [
    ...new Set([
      ...(Array.isArray(configuration.actions)
        ? configuration.actions.flatMap((action) =>
            isRecord(action) && typeof action.name === 'string'
              ? [action.name]
              : [],
          )
        : []),
      ...configuredActionNames(configuration.content),
      ...configuredActionNames(configuration.media),
    ]),
  ]
}

export function filterConfigurationForDiscovery(
  configuration: Record<string, unknown>,
  discovery: AccessDiscoveryDecision,
) {
  if (discovery.visibility === 'all') return toJsonObject(configuration)
  const visible = new Set(
    discovery.visibility === 'filtered'
      ? discovery.resources.map(
          (resource) => `${resource.type}:${resource.name}`,
        )
      : [],
  )
  const navigation = isRecord(configuration.navigation)
    ? {
        ...configuration.navigation,
        content: filterNamedValues(
          configuration.navigation.content,
          'collection',
          visible,
        ),
        media: filterNamedValues(
          configuration.navigation.media,
          'media',
          visible,
        ),
      }
    : configuration.navigation
  return toJsonObject({
    ...configuration,
    content: filterNamedValues(configuration.content, 'collection', visible),
    media: filterNamedValues(configuration.media, 'media', visible),
    actions: filterNamedValues(configuration.actions, 'action', visible),
    ...(navigation === undefined ? {} : { navigation }),
  })
}
