import type { readFixedFile as getFixedFile } from '#/server/services/content'
import { readApi } from '#/client/api/index'

type Input = {
  owner: string
  repo: string
  repoId?: string
  branch: string
  name: string
  locale?: string
}

export async function readFile(input: Input): ReturnType<typeof getFixedFile> {
  const params = new URLSearchParams({
    owner: input.owner,
    repo: input.repo,
    branch: input.branch,
    name: input.name,
  })
  if (input.repoId) params.set('repoId', input.repoId)
  if (input.locale) params.set('locale', input.locale)
  return readApi(`/api/files?${params}`)
}
