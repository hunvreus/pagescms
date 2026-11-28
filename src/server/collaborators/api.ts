import { normalizeGitPath } from '#/shared/git-path'
import type { GitHubApi } from '#/server/github/api'

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
      for (const move of input.moves ?? []) {
        editablePath(move.path)
        editablePath(move.newPath)
      }
      return api.renameFile(input)
    },
  }
}
