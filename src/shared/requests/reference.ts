import { repositoryRef } from '#/lib/repository'

export function parseReferenceRequest(input: unknown) {
  if (typeof input !== 'object' || input === null)
    throw new Error('Invalid reference request')
  const value = input as Record<string, unknown>
  if (
    typeof value.owner !== 'string' ||
    typeof value.repo !== 'string' ||
    typeof value.branch !== 'string' ||
    !value.branch ||
    typeof value.collection !== 'string' ||
    !value.collection ||
    typeof value.query !== 'string' ||
    typeof value.valueTemplate !== 'string' ||
    typeof value.labelTemplate !== 'string' ||
    !Array.isArray(value.searchFields) ||
    !value.searchFields.every((field) => typeof field === 'string') ||
    !Array.isArray(value.selectedValues) ||
    !value.selectedValues.every((selected) => typeof selected === 'string')
  ) {
    throw new Error('Invalid reference request')
  }
  if (
    (value.cursor !== undefined &&
      (typeof value.cursor !== 'string' || value.cursor.length > 250000)) ||
    value.query.length > 100 ||
    value.valueTemplate.length > 200 ||
    value.labelTemplate.length > 200 ||
    value.searchFields.length > 10 ||
    value.selectedValues.length > 100
  ) {
    throw new Error('Reference request is too large')
  }
  return {
    ...repositoryRef({
      owner: value.owner,
      repo: value.repo,
      repoId: value.repoId,
    }),
    branch: value.branch,
    collection: value.collection,
    locale: typeof value.locale === 'string' ? value.locale : undefined,
    query: value.query,
    cursor: value.cursor,
    valueTemplate: value.valueTemplate,
    labelTemplate: value.labelTemplate,
    searchFields: value.searchFields,
    selectedValues: value.selectedValues,
  }
}
