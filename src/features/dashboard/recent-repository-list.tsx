import { useLingui } from '@lingui/react'
import {
  Trans as UiTrans,
  useLingui as useUiMessages,
} from '@lingui/react/macro'
import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'

import { LoadError } from '#/components/operation-error'
import { Button } from '#/components/ui/button'
import { repositoryIdentityKey } from '#/lib/repository-identity'

import { readRecentRepositories } from './recent-repositories'
import { relativeTime } from './relative-time'

import type { RecentRepository } from './recent-repositories'

export function RecentRepositoryList({ account }: { account: string }) {
  const { t: _t } = useUiMessages()
  const { i18n: dateI18n } = useLingui()

  const [projects, setRepositories] = useState<RecentRepository[] | null>(null)

  const [error, setError] = useState<unknown>(null)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    try {
      setRepositories(readRecentRepositories(account).slice(0, 3))
      setError(null)
    } catch (cause) {
      setError(cause)
    }
  }, [account, attempt])
  if (!projects?.length && !error) return null

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-medium tracking-tight">
        <UiTrans>Recently visited</UiTrans>
      </h2>
      <LoadError
        error={error}
        message={_t({ message: 'Could not load recently visited projects' })}
        stale={Boolean(projects)}
        onRetry={() => setAttempt((value) => value + 1)}
      />
      {projects?.length ? (
        <ul className="rounded-md border px-3">
          {projects.map((project) => (
            <li
              className="flex items-center gap-2 border-b py-2 text-sm last:border-b-0"
              key={repositoryIdentityKey(project)}
            >
              <img
                alt={_t({ message: `${project.owner}'s avatar` })}
                className="size-5 shrink-0 rounded"
                height="20"
                src={`https://github.com/${encodeURIComponent(project.owner)}.png?size=48`}
                width="20"
              />
              <Link
                className="truncate font-medium hover:underline"
                params={project}
                to="/github/$owner/$repo/$branch"
              >
                {project.repo}
              </Link>
              <span className="truncate text-muted-foreground">
                {relativeTime(project.timestamp, Date.now(), dateI18n.locale)}
              </span>
              <Button asChild className="ml-auto" size="xs" variant="outline">
                <Link params={project} to="/github/$owner/$repo/$branch">
                  <UiTrans>Open</UiTrans>
                </Link>
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
