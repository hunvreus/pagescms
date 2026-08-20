import { getGitFileName, normalizeGitPath } from './git-path'

export type CommitAction = 'create' | 'update' | 'delete' | 'rename'
export type CommitIdentity = 'app' | 'user'
export type CommitTemplates = Partial<Record<CommitAction, string>>

const defaultCommitTemplates: Readonly<Record<CommitAction, string>> = {
  create: 'Create {path} (via Pages CMS)',
  update: 'Update {path} (via Pages CMS)',
  delete: 'Delete {path} (via Pages CMS)',
  rename: 'Rename {oldPath} to {newPath} (via Pages CMS)',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getCommitConfiguration(configuration: unknown) {
  if (!isRecord(configuration) || !isRecord(configuration.settings)) return
  const commit = configuration.settings.commit
  return isRecord(commit) ? commit : undefined
}

function getConfiguredTemplates(configuration: unknown): CommitTemplates {
  const templates = getCommitConfiguration(configuration)?.templates
  if (!isRecord(templates)) return {}

  return Object.fromEntries(
    Object.entries(templates).filter(
      (entry): entry is [CommitAction, string] =>
        ['create', 'update', 'delete', 'rename'].includes(entry[0]) &&
        typeof entry[1] === 'string',
    ),
  )
}

function normalizeOptionalPath(path?: string) {
  return path ? normalizeGitPath(path) : ''
}

export function buildCommitTokens({
  action,
  owner,
  repo,
  branch,
  path,
  oldPath,
  newPath,
  contentName,
  user,
  userName,
  userEmail,
}: {
  action: CommitAction
  owner: string
  repo: string
  branch: string
  path?: string
  oldPath?: string
  newPath?: string
  contentName?: string
  user?: string
  userName?: string
  userEmail?: string
}): Record<string, string> {
  const normalizedPath = normalizeOptionalPath(path)
  const normalizedOldPath = normalizeOptionalPath(oldPath)
  const normalizedNewPath = normalizeOptionalPath(newPath)

  return {
    action,
    owner,
    repo,
    branch,
    name: contentName || '',
    user: user || userName || userEmail || '',
    userName: userName || '',
    userEmail: userEmail || '',
    path: normalizedPath,
    filename: normalizedPath ? getGitFileName(normalizedPath) : '',
    oldPath: normalizedOldPath,
    oldFilename: normalizedOldPath ? getGitFileName(normalizedOldPath) : '',
    newPath: normalizedNewPath,
    newFilename: normalizedNewPath ? getGitFileName(normalizedNewPath) : '',
  }
}

function renderCommitTemplate(
  template: string,
  tokens: Record<string, string | undefined>,
) {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, token: string) => {
    const value = tokens[token]
    return typeof value === 'string' ? value : ''
  })
}

export function resolveCommitMessage({
  configuration,
  templatesOverride,
  action,
  tokens,
}: {
  configuration?: unknown
  templatesOverride?: CommitTemplates
  action: CommitAction
  tokens: Record<string, string | undefined>
}): string {
  const globalTemplates = getConfiguredTemplates(configuration)
  const overrideTemplate = templatesOverride?.[action]
  const globalTemplate = globalTemplates[action]
  const template =
    typeof overrideTemplate === 'string' && overrideTemplate.trim()
      ? overrideTemplate
      : typeof globalTemplate === 'string' && globalTemplate.trim()
        ? globalTemplate
        : defaultCommitTemplates[action]

  return renderCommitTemplate(template, tokens)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200)
}

export function resolveCommitIdentity({
  configuration,
  identityOverride,
}: {
  configuration?: unknown
  identityOverride?: CommitIdentity
}): CommitIdentity {
  if (identityOverride === 'app' || identityOverride === 'user') {
    return identityOverride
  }

  return getCommitConfiguration(configuration)?.identity === 'user'
    ? 'user'
    : 'app'
}
