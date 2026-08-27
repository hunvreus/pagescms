export interface RecentProject {
  owner: string
  repo: string
  branch: string
  timestamp: number
}

export const RECENT_PROJECTS_KEY = 'latestVisits'
const MAX_RECENT_PROJECTS = 5

function isRecentProject(value: unknown): value is RecentProject {
  if (typeof value !== 'object' || value === null) return false
  const project = value as Record<string, unknown>
  return (
    typeof project.owner === 'string' &&
    project.owner.length > 0 &&
    typeof project.repo === 'string' &&
    project.repo.length > 0 &&
    typeof project.branch === 'string' &&
    project.branch.length > 0 &&
    typeof project.timestamp === 'number' &&
    Number.isFinite(project.timestamp)
  )
}

export function parseRecentProjects(value: string | null): RecentProject[] {
  if (!value) return []
  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(isRecentProject)
      .sort((left, right) => right.timestamp - left.timestamp)
      .slice(0, MAX_RECENT_PROJECTS)
  } catch {
    return []
  }
}

export function addRecentProject(
  projects: readonly RecentProject[],
  project: RecentProject,
): RecentProject[] {
  const owner = project.owner.toLowerCase()
  const repo = project.repo.toLowerCase()
  return [
    project,
    ...projects.filter(
      (candidate) =>
        candidate.owner.toLowerCase() !== owner ||
        candidate.repo.toLowerCase() !== repo,
    ),
  ]
    .sort((left, right) => right.timestamp - left.timestamp)
    .slice(0, MAX_RECENT_PROJECTS)
}

export function readRecentProjects(): RecentProject[] {
  if (typeof window === 'undefined') return []
  return parseRecentProjects(window.localStorage.getItem(RECENT_PROJECTS_KEY))
}

export function trackRecentProject(
  project: Omit<RecentProject, 'timestamp'>,
): void {
  if (typeof window === 'undefined') return
  const projects = addRecentProject(readRecentProjects(), {
    ...project,
    timestamp: Math.floor(Date.now() / 1000),
  })
  window.localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(projects))
}
