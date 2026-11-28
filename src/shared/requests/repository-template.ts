import { REPOSITORY_TEMPLATES } from '#/shared/repository-templates'
import { parseRepositorySearch } from '#/shared/repository-search'

export function parseTemplateCopy(input: unknown) {
  if (typeof input !== 'object' || input === null) {
    throw new Error('Invalid template request')
  }
  const value = input as Record<string, unknown>
  const account = parseRepositorySearch({ account: value.account }).account
  const template = REPOSITORY_TEMPLATES.find(
    (candidate) => candidate.repository === value.template,
  )
  if (!template) throw new Error('Invalid project template')
  if (
    typeof value.name !== 'string' ||
    !/^(?!\.|\.\.|.*\/|.*\/\.|.*\.\.)(?!@)(?!.*[~^:?*[\]{}()<>#%&!\\$'"|;,])[^\x20\x7f]*[^\x20\x7f.]$/.test(
      value.name,
    )
  ) {
    throw new Error('Invalid repository name')
  }
  const [templateOwner, templateRepo] = template.repository.split('/') as [
    string,
    string,
  ]
  return {
    account,
    name: value.name,
    templateOwner,
    templateRepo,
  }
}
