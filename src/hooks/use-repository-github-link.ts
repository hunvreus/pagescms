import { createContext, useContext } from 'react'

export const RepositoryGitHubLinkContext = createContext(false)

export function useRepositoryGitHubLink() {
  // A linked account alone does not prove access to this repository on GitHub.
  return useContext(RepositoryGitHubLinkContext)
}
