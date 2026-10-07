import { normalizeGitPath } from '#/lib/git-path'
import type { GitHubApi } from './github-api.server'

function editablePath(path: string) {
  if (normalizeGitPath(path) === '.pages.yml') {
    throw new Error('Collaborators cannot change repository configuration')
  }
}

// Constrain the installation token itself, including alternate entry/media
// mutation paths that could otherwise target the configuration file.
export function collaboratorApi(api: GitHubApi): GitHubApi {
  return {
    ...api,
    async putFile(input) {
      editablePath(input.path)
      return api.putFile(input)
    },
    async deleteFile(input) {
      editablePath(input.path)
      return api.deleteFile(input)
    },
    async renameFile(input) {
      editablePath(input.path)
      editablePath(input.newPath)
      return api.renameFile(input)
    },
  }
}
