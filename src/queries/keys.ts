interface RepositoryRef {
  owner: string
  repo: string
}

interface BranchRef extends RepositoryRef {
  branch: string
}

function repositoryKey(input: RepositoryRef) {
  return [input.owner.toLowerCase(), input.repo.toLowerCase()] as const
}

function branchKey(input: BranchRef) {
  return [...repositoryKey(input), input.branch] as const
}

export const queryKeys = {
  all: ['pagescms'] as const,
  session: () => ['pagescms', 'session'] as const,
  dashboard: () => ['pagescms', 'dashboard'] as const,
  settings: () => ['pagescms', 'settings'] as const,
  admin: () => ['pagescms', 'admin'] as const,
  invitations: () => ['pagescms', 'invitations'] as const,
  repositories: () => ['pagescms', 'repositories'] as const,
  repository: (input: RepositoryRef) =>
    ['pagescms', 'repositories', ...repositoryKey(input)] as const,
  branch: (input: BranchRef) =>
    ['pagescms', 'repositories', ...branchKey(input)] as const,
}

export const queryTimes = {
  minute: 60_000,
  gc: 15 * 60_000,
} as const
