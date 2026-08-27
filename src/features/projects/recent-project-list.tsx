import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'

import { Button } from '#/components/ui/button'
import { Skeleton } from '#/components/ui/skeleton'

import { readRecentProjects } from './recent-projects'
import { relativeTime } from './relative-time'

import type { RecentProject } from './recent-projects'

export function RecentProjectList() {
  const [projects, setProjects] = useState<RecentProject[] | null>(null)

  useEffect(() => setProjects(readRecentProjects().slice(0, 3)), [])

  if (projects === null) return <RecentProjectListSkeleton />
  if (projects.length === 0) return null

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-medium tracking-tight">Recently visited</h2>
      <ul>
        {projects.map((project) => (
          <li
            className="flex items-center gap-2 border border-b-0 px-3 py-2 text-sm first:rounded-t-md last:rounded-b-md last:border-b"
            key={`${project.owner}/${project.repo}`}
          >
            <img
              alt={`${project.owner}'s avatar`}
              className="size-6 rounded"
              height="24"
              src={`https://github.com/${encodeURIComponent(project.owner)}.png?size=48`}
              width="24"
            />
            <Link
              className="truncate font-medium hover:underline"
              params={project}
              to="/$owner/$repo/$branch"
            >
              {project.repo}
            </Link>
            <span className="truncate text-muted-foreground">
              {relativeTime(project.timestamp)}
            </span>
            <Button asChild className="ml-auto" size="xs" variant="outline">
              <Link params={project} to="/$owner/$repo/$branch">
                Open
              </Link>
            </Button>
          </li>
        ))}
      </ul>
    </section>
  )
}

function RecentProjectListSkeleton() {
  return (
    <section className="space-y-4" aria-label="Loading recent projects">
      <h2 className="text-lg font-medium tracking-tight">Recently visited</h2>
      <div>
        {[0, 1, 2].map((index) => (
          <div
            className="flex items-center gap-2 border border-b-0 px-3 py-2 last:rounded-b-md last:border-b first:rounded-t-md"
            key={index}
          >
            <Skeleton className="size-6 rounded" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="ml-auto h-4 w-20" />
            <Skeleton className="h-6 w-12" />
          </div>
        ))}
      </div>
    </section>
  )
}
