import type {
  RepositoryApi,
  RepositoryFile,
} from '#/server/repository/provider'

// One instance belongs to one request. Never share file contents across users.
export function createConfigurationReader() {
  let files = new WeakMap<RepositoryApi, Map<string, Promise<RepositoryFile>>>()
  return {
    read(api: RepositoryApi, owner: string, repo: string, branch: string) {
      let reads = files.get(api)
      if (!reads) {
        reads = new Map()
        files.set(api, reads)
      }
      const key = JSON.stringify([owner, repo, branch])
      const existing = reads.get(key)
      if (existing) return existing
      const request = api.getFile(owner, repo, '.pages.yml', branch)
      reads.set(key, request)
      void request.catch(() => {
        if (reads.get(key) === request) reads.delete(key)
      })
      return request
    },
    clear() {
      files = new WeakMap()
    },
  }
}
