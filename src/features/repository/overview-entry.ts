import { findContentSchema } from '#/shared/configuration-content'
import { getConfigurationNavigationGroupTrail } from '#/shared/configuration-navigation'
import { buildEntryBreadcrumb } from '#/features/editor/entry-breadcrumb'
import type { EntryBreadcrumbSegment } from '#/features/editor/entry-breadcrumb'
import type { EntrySummary } from '#/features/drafts/draft-store'
import type { ConfigurationNavigationItem } from '#/shared/configuration-navigation'

export function overviewEntryBreadcrumb(
  entry: EntrySummary,
  configuration: Record<string, unknown>,
  resource?: ConfigurationNavigationItem,
): EntryBreadcrumbSegment[] {
  const schema = findContentSchema(configuration, entry.target.name)
  const storedTitle =
    entry.title === '[object Object]'
      ? entry.target.path?.split('/').at(-1)
      : entry.title
  const title =
    entry.target.kind === 'configuration'
      ? 'Configuration'
      : schema?.type === 'file'
        ? resource?.label || storedTitle || schema.name
        : storedTitle || 'Untitled entry'
  const fallback: EntryBreadcrumbSegment[] = [{ type: 'current', label: title }]
  if (entry.target.kind === 'configuration' || !schema) return fallback
  try {
    return buildEntryBreadcrumb({
      currentLabel: title,
      schemaLabel: resource?.label || schema.name,
      schemaType: schema.type,
      rootPath: schema.path,
      entryPath: entry.target.path,
      creationParent: entry.target.parent,
      groupTrail:
        schema.type === 'file'
          ? getConfigurationNavigationGroupTrail(configuration, schema.name)
          : [],
    })
  } catch {
    // A local record can outlive a change to its configured collection root.
    return fallback
  }
}

export function overviewBreadcrumbLabel(
  segments: readonly EntryBreadcrumbSegment[],
) {
  return segments.map((segment) => segment.label).join(' › ')
}

export function overviewParentLabel(
  parents: readonly EntryBreadcrumbSegment[],
) {
  const last = parents.at(-1)
  if (parents[0]?.type === 'root' && last && parents.length > 2) {
    return [parents[0].label, '…', last.label].join(' › ')
  }
  return overviewBreadcrumbLabel(parents)
}
