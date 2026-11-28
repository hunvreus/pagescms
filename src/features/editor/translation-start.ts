import { repositoryIdentityKey } from '#/lib/repository-identity'
import type { QueryClient } from '@tanstack/react-query'
import type { JsonObject, JsonValue } from '#/shared/json'

export type TranslationValue = JsonObject | JsonValue[] | string
export function translationStartKey(
  account: string,
  coordinates: {
    repoId?: string
    source?: string
    owner: string
    repo: string
    branch: string
    name: string
    path: string
  },
) {
  return [
    'pagescms',
    'translation-start',
    account,
    repositoryIdentityKey(coordinates),
    coordinates.branch,
    coordinates.name,
    coordinates.path,
  ] as const
}
export function stageTranslation(
  client: QueryClient,
  key: ReturnType<typeof translationStartKey>,
  value?: TranslationValue,
) {
  client.removeQueries({ queryKey: key, exact: true })
  if (value !== undefined) client.setQueryData(key, structuredClone(value))
}
