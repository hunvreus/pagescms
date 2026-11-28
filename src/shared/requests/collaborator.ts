import { parseCollaboratorEmails } from '#/lib/collaborator-invites'
import { repositoryRef } from '#/lib/repository'

export function coordinates(input: unknown) {
  if (typeof input !== 'object' || input === null) {
    throw new Error('Invalid collaborator request')
  }
  const value = input as Record<string, unknown>
  if (
    typeof value.owner !== 'string' ||
    typeof value.repo !== 'string' ||
    typeof value.branch !== 'string' ||
    !value.branch
  ) {
    throw new Error('Invalid collaborator request')
  }
  return {
    ...repositoryRef({
      owner: value.owner,
      repo: value.repo,
      repoId: value.repoId,
    }),
    branch: value.branch,
  }
}

export function inviteRequest(input: unknown) {
  const repository = coordinates(input)
  const value = input as Record<string, unknown>
  if (typeof value.emails !== 'string')
    throw new Error('Invalid collaborator emails')
  return {
    ...repository,
    emails: parseCollaboratorEmails(value.emails),
  }
}

export function removeRequest(input: unknown) {
  const repository = coordinates(input)
  const value = input as Record<string, unknown>
  if (
    typeof value.id !== 'number' ||
    !Number.isInteger(value.id) ||
    value.id <= 0
  ) {
    throw new Error('Invalid collaborator id')
  }
  return { ...repository, id: value.id }
}
