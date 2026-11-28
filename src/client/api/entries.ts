import { notFound } from '@tanstack/react-router'
import type {
  readRawEntry as getRawEntry,
  readEntryHistory,
} from '#/server/services/content'
import { parseEntryHistory } from '#/shared/requests/entry'
import { ApiNotFoundError, readApi } from '#/client/api/index'
import type { readEntryTranslations } from '#/server/services/entry-translations'

type Input = {
  owner: string
  repo: string
  repoId?: string
  branch: string
  name: string
  path: string
}

function parameters(input: Input) {
  const params = new URLSearchParams({
    owner: input.owner,
    repo: input.repo,
    branch: input.branch,
    name: input.name,
    path: input.path,
  })
  if (input.repoId) params.set('repoId', input.repoId)
  return params
}

export async function readTranslations(
  input: Input,
): ReturnType<typeof readEntryTranslations> {
  return readApi(`/api/entries/translations?${parameters(input)}`)
}

export async function readEntry(input: Input): ReturnType<typeof getRawEntry> {
  try {
    return await readApi(`/api/entries?${parameters(input)}`)
  } catch (error) {
    if (error instanceof ApiNotFoundError) throw notFound()
    throw error
  }
}

export function getEntryHistory(
  input: unknown,
): ReturnType<typeof readEntryHistory> {
  const data = parseEntryHistory(input)
  const params = parameters(data)
  params.set('page', String(data.page))
  return readApi(`/api/entries/history?${params}`)
}
