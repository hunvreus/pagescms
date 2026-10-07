import { branchName } from '#/lib/repository'

export function compactBranches(
  branches: readonly string[],
  current: string,
  defaultBranch: string,
) {
  return [...new Set([current, defaultBranch, ...branches])].slice(0, 5)
}

export function canCreateBranch(value: string, branches: readonly string[]) {
  try {
    return !branches.includes(branchName(value))
  } catch {
    return false
  }
}
