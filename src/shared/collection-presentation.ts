import { schemaActions } from '#/lib/actions'
import { resolveContentOperations } from '#/lib/content-operations'
import { contentI18n } from '#/lib/i18n'
import type { ContentSchema } from './configuration-content'
import { getConfigurationNavigationGroupTrail } from './configuration-navigation'

export function collectionPresentation(
  configuration: Record<string, unknown>,
  schema: ContentSchema,
) {
  return {
    name: schema.name,
    label:
      typeof schema.label === 'string' && schema.label
        ? schema.label
        : schema.name,
    rootPath: schema.path,
    groupTrail: getConfigurationNavigationGroupTrail(
      configuration,
      schema.name,
    ),
    i18n: contentI18n(schema) ?? null,
    format: typeof schema.format === 'string' ? schema.format : null,
    subfolders: schema.subfolders !== false,
    operations: resolveContentOperations({ schema }),
    actions: schemaActions(schema, 'collection'),
  }
}
