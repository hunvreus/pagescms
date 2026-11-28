import { repositoryRef } from '#/lib/repository'
import { historyPage } from '#/lib/file-history'

export function configurationCoordinates(input: unknown) {
  if (typeof input !== 'object' || input === null)
    throw new Error('Invalid configuration request')
  const value = input as Record<string, unknown>
  if (
    typeof value.owner !== 'string' ||
    typeof value.repo !== 'string' ||
    typeof value.branch !== 'string' ||
    !value.branch
  )
    throw new Error('Invalid configuration request')
  return {
    ...repositoryRef({
      owner: value.owner,
      repo: value.repo,
      repoId: value.repoId,
    }),
    branch: value.branch,
  }
}

export function configurationSave(input: unknown) {
  const coordinates = configurationCoordinates(input)
  const value = input as Record<string, unknown>
  if (
    typeof value.source !== 'string' ||
    (value.sha !== null && typeof value.sha !== 'string')
  )
    throw new Error('Invalid configuration update')
  return { ...coordinates, source: value.source, sha: value.sha }
}

export function configurationHistory(input: unknown) {
  return {
    ...configurationCoordinates(input),
    page: historyPage((input as Record<string, unknown>).page),
  }
}
