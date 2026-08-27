export interface ConfigurationNavigationItem {
  type: 'collection' | 'file' | 'media'
  name: string
  label: string
}

export interface ConfigurationNavigationGroup {
  type: 'group'
  name: string
  label: string
  items: ConfigurationNavigationNode[]
}

export type ConfigurationNavigationNode =
  ConfigurationNavigationItem | ConfigurationNavigationGroup

export interface ConfigurationNavigationGroups {
  content: ConfigurationNavigationNode[]
  media: ConfigurationNavigationNode[]
}

export interface ConfigurationNavigationGroupTrailItem {
  name: string
  label: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function navigationNodes(
  values: unknown,
  allowedTypes: readonly ConfigurationNavigationItem['type'][],
): ConfigurationNavigationNode[] {
  if (!Array.isArray(values)) return []
  return values.flatMap((value): ConfigurationNavigationNode[] => {
    if (!isRecord(value) || typeof value.name !== 'string') return []
    const label =
      typeof value.label === 'string' && value.label ? value.label : value.name
    if (value.type === 'group') {
      return [
        {
          type: 'group',
          name: value.name,
          label,
          items: navigationNodes(value.items, allowedTypes),
        },
      ]
    }
    if (
      !allowedTypes.includes(value.type as ConfigurationNavigationItem['type'])
    ) {
      return []
    }
    return [
      {
        type: value.type as ConfigurationNavigationItem['type'],
        name: value.name,
        label,
      },
    ]
  })
}

function mediaFallback(values: unknown): ConfigurationNavigationNode[] {
  if (!Array.isArray(values)) return []
  return values.flatMap((value): ConfigurationNavigationNode[] => {
    if (!isRecord(value)) return []
    const name = typeof value.name === 'string' ? value.name : 'default'
    return [
      {
        type: 'media',
        name,
        label:
          typeof value.label === 'string' && value.label
            ? value.label
            : name === 'default'
              ? 'Media'
              : name,
      },
    ]
  })
}

export function getConfigurationNavigationGroups(
  configuration: Record<string, unknown>,
): ConfigurationNavigationGroups {
  const navigation = isRecord(configuration.navigation)
    ? configuration.navigation
    : null
  return {
    content: navigationNodes(navigation?.content ?? configuration.content, [
      'collection',
      'file',
    ]),
    media: navigation?.media
      ? navigationNodes(navigation.media, ['media'])
      : mediaFallback(configuration.media),
  }
}

export function getConfigurationNavigationGroupTrail(
  configuration: Record<string, unknown>,
  name: string,
): ConfigurationNavigationGroupTrailItem[] {
  const navigation = isRecord(configuration.navigation)
    ? configuration.navigation
    : null
  const source = navigation?.content ?? configuration.content

  function visit(
    values: unknown,
    parents: ConfigurationNavigationGroupTrailItem[],
  ): ConfigurationNavigationGroupTrailItem[] | null {
    if (!Array.isArray(values)) return null
    for (const value of values) {
      if (!isRecord(value)) continue
      if (value.type === 'group') {
        const groupName = typeof value.name === 'string' ? value.name : ''
        const match = visit(value.items, [
          ...parents,
          {
            name: groupName,
            label:
              typeof value.label === 'string' && value.label
                ? value.label
                : groupName,
          },
        ])
        if (match) return match
      } else if (value.name === name) {
        return parents
      }
    }
    return null
  }

  return visit(source, []) ?? []
}

function flattenNavigation(
  nodes: readonly ConfigurationNavigationNode[],
): ConfigurationNavigationItem[] {
  return nodes.flatMap((node) =>
    node.type === 'group' ? flattenNavigation(node.items) : [node],
  )
}

export function getConfigurationNavigation(
  configuration: Record<string, unknown>,
): ConfigurationNavigationItem[] {
  const groups = getConfigurationNavigationGroups(configuration)
  return [
    ...flattenNavigation(groups.content),
    ...flattenNavigation(groups.media),
  ]
}

export function getDefaultConfigurationNavigationItem(
  configuration: Record<string, unknown>,
): ConfigurationNavigationItem | null {
  return getConfigurationNavigation(configuration)[0] ?? null
}
