import { notFound } from '@tanstack/react-router'
import {
  findContentSchema,
  findMediaSchema,
} from '#/shared/configuration-content'
import { repositoryQueryOptions } from '#/client/queries/repository'
import type { QueryClient } from '@tanstack/react-query'

/** Check only the already-authorized repositoryData snapshot; do not turn transport failures into 404s. */
export function requireRepositoryResource(
  client: QueryClient,
  params: { owner: string; repo: string; branch: string; name: string },
  type: 'collection' | 'file' | 'media',
) {
  const repositoryData = client.getQueryData(
    repositoryQueryOptions(params).queryKey,
  )
  if (!repositoryData) return
  const configuration = repositoryData.configuration?.object
  const schema =
    configuration &&
    (type === 'media'
      ? findMediaSchema(configuration, params.name)
      : findContentSchema(configuration, params.name))
  if (!schema || (type !== 'media' && schema.type !== type)) throw notFound()
}
