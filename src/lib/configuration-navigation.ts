export interface ConfigurationNavigationItem {
  type: 'collection' | 'file' | 'media'
  name: string
  label: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function contentItems(values: unknown): ConfigurationNavigationItem[] {
  if (!Array.isArray(values)) return []
  return values.flatMap((value): ConfigurationNavigationItem[] => {
    if (!isRecord(value)) return []
    if (value.type === 'group') return contentItems(value.items)
    if (
      (value.type !== 'collection' && value.type !== 'file') ||
      typeof value.name !== 'string'
    ) {
      return []
    }
    return [
      {
        type: value.type,
        name: value.name,
        label:
          typeof value.label === 'string' && value.label
            ? value.label
            : value.name,
      },
    ]
  })
}

export function getConfigurationNavigation(
  configuration: Record<string, unknown>,
): ConfigurationNavigationItem[] {
  const content = contentItems(configuration.content)
  const media = Array.isArray(configuration.media)
    ? configuration.media.flatMap((value): ConfigurationNavigationItem[] => {
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
    : []
  return [...content, ...media]
}
