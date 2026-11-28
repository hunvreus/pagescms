import { normalizeGitPath } from '#/shared/git-path'
import { parseEntryRequest } from '#/shared/requests/entry'
import { repositoryRef } from '#/lib/repository'

function optionalCommitMessage(value: unknown) {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string' || value.length > 4096)
    throw new Error('Commit message must be at most 4096 characters')
  return value
}

export function parseEntryUpdate(input: unknown) {
  const entry = parseEntryRequest(input)
  const value = input as Record<string, unknown>
  if (
    typeof value.source !== 'string' ||
    (value.sha !== null && typeof value.sha !== 'string')
  ) {
    throw new Error('Invalid entry update')
  }
  return {
    ...entry,
    source: value.source,
    sha: value.sha,
    message: optionalCommitMessage(value.message),
  }
}

export function parseEntryDelete(input: unknown) {
  const entry = parseEntryRequest(input)
  const value = input as Record<string, unknown>
  if (typeof value.sha !== 'string' || !value.sha) {
    throw new Error('Invalid entry deletion')
  }
  return { ...entry, sha: value.sha }
}

function confirmedMoves(input: unknown) {
  if (input === undefined) return undefined
  if (
    !Array.isArray(input) ||
    input.length > 50 ||
    input.some(
      (move) =>
        !move ||
        typeof move !== 'object' ||
        typeof move.path !== 'string' ||
        typeof move.newPath !== 'string' ||
        typeof move.sha !== 'string',
    )
  )
    throw new Error('Invalid translation rename confirmation')
  return input.map((move) => ({
    path: String(move.path),
    newPath: String(move.newPath),
    sha: String(move.sha),
    ...(typeof move.revision === 'string' ? { revision: move.revision } : {}),
  }))
}

export function parseEntryRenamePlan(input: unknown) {
  const value = input as Record<string, unknown>
  return {
    ...parseEntryDelete(input),
    ...(typeof value.filename === 'string' ? { filename: value.filename } : {}),
    ...(typeof value.newPath === 'string' ? { newPath: value.newPath } : {}),
  }
}

export function parseEntryRename(input: unknown) {
  const entry = parseEntryDelete(input)
  const value = input as Record<string, unknown>
  if (typeof value.filename !== 'string') {
    throw new Error('Invalid entry rename')
  }
  return {
    ...entry,
    filename: value.filename,
    confirmedMoves: confirmedMoves(value.confirmedMoves),
  }
}

export function parseEntryMove(input: unknown) {
  const entry = parseEntryDelete(input)
  const value = input as Record<string, unknown>
  if (typeof value.newPath !== 'string') {
    throw new Error('Invalid entry move')
  }
  const newPath = normalizeGitPath(value.newPath.trim())
  if (!newPath) throw new Error('Invalid entry move')
  return {
    ...entry,
    newPath,
    confirmedMoves: confirmedMoves(value.confirmedMoves),
  }
}

export function parseStructuredEntryUpdate(input: unknown) {
  const entry = parseEntryRequest(input)
  const value = input as Record<string, unknown>
  if (
    (value.sha !== null && typeof value.sha !== 'string') ||
    typeof value.content !== 'object' ||
    value.content === null
  ) {
    throw new Error('Invalid structured entry update')
  }
  return {
    ...entry,
    content: value.content,
    sha: value.sha,
    message: optionalCommitMessage(value.message),
  }
}

export function parseStructuredEntryCreate(input: unknown) {
  if (typeof input !== 'object' || input === null) {
    throw new Error('Invalid entry creation')
  }
  const value = input as Record<string, unknown>
  if (
    typeof value.owner !== 'string' ||
    typeof value.repo !== 'string' ||
    typeof value.branch !== 'string' ||
    !value.branch ||
    typeof value.name !== 'string' ||
    !value.name ||
    value.name.includes('/') ||
    typeof value.content !== 'object' ||
    value.content === null ||
    (value.parent !== undefined && typeof value.parent !== 'string') ||
    (value.filename !== undefined && typeof value.filename !== 'string')
  ) {
    throw new Error('Invalid entry creation')
  }
  return {
    ...repositoryRef({
      owner: value.owner,
      repo: value.repo,
      repoId: value.repoId,
    }),
    branch: value.branch,
    name: value.name,
    locale: typeof value.locale === 'string' ? value.locale : undefined,
    content: value.content,
    ...(value.parent ? { parent: normalizeGitPath(value.parent) } : {}),
    ...(value.filename !== undefined ? { filename: value.filename } : {}),
    message: optionalCommitMessage(value.message),
  }
}

export function parseRawEntryCreate(input: unknown) {
  if (typeof input !== 'object' || input === null) {
    throw new Error('Invalid raw entry creation')
  }
  const value = input as Record<string, unknown>
  if (
    typeof value.owner !== 'string' ||
    typeof value.repo !== 'string' ||
    typeof value.branch !== 'string' ||
    !value.branch ||
    typeof value.name !== 'string' ||
    !value.name ||
    value.name.includes('/') ||
    typeof value.source !== 'string' ||
    (value.parent !== undefined && typeof value.parent !== 'string') ||
    (value.filename !== undefined && typeof value.filename !== 'string')
  ) {
    throw new Error('Invalid raw entry creation')
  }
  return {
    ...repositoryRef({
      owner: value.owner,
      repo: value.repo,
      repoId: value.repoId,
    }),
    branch: value.branch,
    name: value.name,
    locale: typeof value.locale === 'string' ? value.locale : undefined,
    source: value.source,
    ...(value.parent ? { parent: normalizeGitPath(value.parent) } : {}),
    ...(value.filename !== undefined ? { filename: value.filename } : {}),
    message: optionalCommitMessage(value.message),
  }
}

export function parseCollectionFolderCreate(input: unknown) {
  if (typeof input !== 'object' || input === null) {
    throw new Error('Invalid folder creation')
  }
  const value = input as Record<string, unknown>
  if (
    typeof value.owner !== 'string' ||
    typeof value.repo !== 'string' ||
    typeof value.branch !== 'string' ||
    !value.branch ||
    typeof value.name !== 'string' ||
    !value.name ||
    value.name.includes('/') ||
    typeof value.parent !== 'string' ||
    typeof value.folder !== 'string'
  ) {
    throw new Error('Invalid folder creation')
  }
  const folder = normalizeGitPath(value.folder.trim())
  if (!folder || folder.split('/').some((part) => part === '.gitkeep')) {
    throw new Error('Folder name is invalid')
  }
  return {
    ...repositoryRef({
      owner: value.owner,
      repo: value.repo,
      repoId: value.repoId,
    }),
    branch: value.branch,
    name: value.name,
    parent: normalizeGitPath(value.parent),
    folder,
    locale: typeof value.locale === 'string' ? value.locale : undefined,
  }
}
