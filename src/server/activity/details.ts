import { all, repositoryAddressQuery } from '#/server/db/sql'
import { getEntryTitle } from '#/features/editor/entry-title'
import { getContentPrimaryField } from '#/lib/content-filename'
import { findContentSchema } from '#/shared/configuration-content'
import { contentFormats, parseContent } from '#/shared/content-serialization'
import { getFileExtension } from '#/lib/file-types'
import type { ActivityItem } from '#/lib/activity'
import type {
  ContentFormat,
  FrontmatterDelimiters,
} from '#/shared/content-serialization'
import type { Database } from '#/server/db/client'
import type { cacheFileTable, userTable } from '#/server/db/schema'
import { DEFAULT_REPOSITORY_SOURCE } from '#/server/repository/provider'

export type ActivityWithActor = ActivityItem & { actorId?: string | null }

export async function activityActors(
  database: Database,
  items: ActivityWithActor[],
): Promise<ActivityItem[]> {
  const ids = [
    ...new Set(items.flatMap((item) => (item.actorId ? [item.actorId] : []))),
  ]
  const users = ids.length
    ? await all<Pick<typeof userTable.$inferSelect, 'id' | 'image'>>(
        database,
        `SELECT id, image FROM user WHERE id IN (${ids.map(() => '?').join(', ')})`,
        ids,
      )
    : []
  const profiles = new Map(users.map((user) => [user.id, user.image]))
  return items.map(({ actorId, ...item }) => ({
    ...item,
    actorImage:
      (actorId ? profiles.get(actorId) : null) || item.actorImage || null,
  }))
}

function cachedTitle(
  source: string,
  path: string,
  schema: Record<string, unknown>,
) {
  const format =
    typeof schema.format === 'string' &&
    contentFormats.has(schema.format as ContentFormat)
      ? (schema.format as ContentFormat)
      : (
          {
            md: 'yaml-frontmatter',
            mdx: 'yaml-frontmatter',
            json: 'json',
            yml: 'yaml',
            yaml: 'yaml',
            toml: 'toml',
          } as Partial<Record<string, ContentFormat>>
        )[getFileExtension(path)]
  if (!format) return null
  try {
    const filename = path.split('/').at(-1) || path
    const title = getEntryTitle({
      content: parseContent(source, {
        format,
        delimiters: schema.delimiters as FrontmatterDelimiters | undefined,
      }),
      filename,
      schema,
      primaryField: getContentPrimaryField(schema),
    })
    return title === filename ? null : title
  } catch {
    return null
  }
}

// Read only authorized subjects for this page. Missing/malformed cache content never triggers a GitHub fetch.
export async function activityTitles(
  database: Database,
  configuration: Record<string, unknown> | null,
  coordinates: {
    owner: string
    repo: string
    branch: string
    repositoryId?: number
  },
  items: ActivityItem[],
) {
  const paths = configuration
    ? [
        ...new Set(
          items
            .filter(
              (item) =>
                (!item.title || item.title === '[object Object]') &&
                item.area === 'collection',
            )
            .map((item) => item.path),
        ),
      ]
    : []
  const identity =
    coordinates.repositoryId === undefined
      ? repositoryAddressQuery(
          DEFAULT_REPOSITORY_SOURCE,
          coordinates.owner,
          coordinates.repo,
        ).sql
      : '?'
  const identityArgs =
    coordinates.repositoryId === undefined
      ? repositoryAddressQuery(
          DEFAULT_REPOSITORY_SOURCE,
          coordinates.owner,
          coordinates.repo,
        ).args
      : [coordinates.repositoryId]
  const files = paths.length
    ? await all<Pick<typeof cacheFileTable.$inferSelect, 'path' | 'content'>>(
        database,
        `SELECT path, content FROM cache_file WHERE source = ? AND repository_id = ${identity} AND branch = ? AND context = 'collection' AND type = 'file' AND path IN (${paths.map(() => '?').join(', ')})`,
        [
          DEFAULT_REPOSITORY_SOURCE,
          ...identityArgs,
          coordinates.branch,
          ...paths,
        ],
      )
    : []
  const contents = new Map(files.map((file) => [file.path, file.content]))
  return items.map((item) => {
    const schema =
      configuration && (item.area === 'file' || item.area === 'collection')
        ? findContentSchema(configuration, item.resource)
        : undefined
    const source = contents.get(item.path)
    const title =
      (item.area === 'file' ? schema?.label || schema?.name : null) ||
      (item.title === '[object Object]' ? null : item.title) ||
      (schema && source != null
        ? cachedTitle(source, item.path, schema)
        : null) ||
      (item.area === 'file'
        ? schema?.label || schema?.name
        : item.area === 'configuration'
          ? 'Configuration'
          : null) ||
      (item.area === 'collaborator' || item.area === 'permissions'
        ? item.path
        : item.path.split('/').at(-1)) ||
      item.path
    return { ...item, title: String(title) }
  })
}
