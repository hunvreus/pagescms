import { repositoryRef } from '#/lib/repository'

export function parseRepositoryRequest(input: unknown) {
  if (typeof input !== 'object' || input === null) {
    throw new Error('Invalid repository request')
  }
  const value = input as Record<string, unknown>
  if (typeof value.owner !== 'string' || typeof value.repo !== 'string') {
    throw new Error('Invalid repository request')
  }
  const repository = repositoryRef({
    owner: value.owner,
    repo: value.repo,
    repoId: value.repoId,
  })
  const branch =
    typeof value.branch === 'string' && value.branch ? value.branch : undefined
  const hasControlCharacter = branch
    ? Array.from(branch).some((character) => {
        const code = character.codePointAt(0)
        return code !== undefined && (code <= 31 || code === 127)
      })
    : false
  if (branch && (branch.length > 255 || hasControlCharacter)) {
    throw new Error('Invalid branch name')
  }
  return { ...repository, branch }
}
