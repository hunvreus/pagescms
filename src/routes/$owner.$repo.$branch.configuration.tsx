import { useState } from 'react'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { Check, ExternalLink, History, LoaderCircle, X } from 'lucide-react'

import { Button } from '#/components/ui/button'
import { OperationError } from '#/components/operation-error'
import {
  RepositoryPageHeader,
  RepositoryPageTitle,
} from '#/components/repository-page-header'
import { Skeleton } from '#/components/ui/skeleton'
import { Textarea } from '#/components/ui/textarea'
import {
  getConfigurationHistory,
  updateConfiguration,
} from '#/functions/configuration-editor'
import { getSignInUrl } from '#/lib/auth-redirect'
import { useUnsavedWarning } from '#/hooks/use-unsaved-warning'
import { configurationEditorQueryOptions } from '#/queries/content'
import { queryKeys } from '#/queries/keys'

export const Route = createFileRoute('/$owner/$repo/$branch/configuration')({
  loader: async ({ context, params }) => {
    try {
      await context.queryClient.ensureQueryData(
        configurationEditorQueryOptions(params),
      )
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'Authentication required'
      ) {
        throw redirect({
          href: getSignInUrl(
            `/${params.owner}/${params.repo}/${encodeURIComponent(params.branch)}/configuration`,
          ),
        })
      }
      throw error
    }
  },
  pendingMs: 100,
  pendingComponent: ConfigurationSkeleton,
  component: ConfigurationEditor,
})

function ConfigurationEditor() {
  const params = Route.useParams()
  const { data: initial } = useSuspenseQuery(
    configurationEditorQueryOptions(params),
  )
  const queryClient = useQueryClient()
  const [source, setSource] = useState(initial.source)
  const [savedSource, setSavedSource] = useState(initial.source)
  const [sha, setSha] = useState<string | null>(initial.sha)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [history, setHistory] = useState<Awaited<
    ReturnType<typeof getConfigurationHistory>
  > | null>(null)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const dirty = source !== savedSource

  useUnsavedWarning(dirty)

  async function save() {
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      const result = await updateConfiguration({
        data: { ...params, source, sha },
      })
      setSha(result.sha)
      setSavedSource(source)
      setSaved(true)
      await queryClient.invalidateQueries({
        queryKey: queryKeys.branch(params),
      })
    } catch (cause) {
      setError(cause)
    } finally {
      setSaving(false)
    }
  }

  async function showHistory() {
    if (history) {
      setHistory(null)
      return
    }
    setLoadingHistory(true)
    setError(null)
    try {
      setHistory(await getConfigurationHistory({ data: params }))
    } catch (cause) {
      setError(cause)
    } finally {
      setLoadingHistory(false)
    }
  }

  return (
    <div className="-m-4 md:-m-6">
      <RepositoryPageHeader
        actions={
          <>
            <Button
              disabled={loadingHistory}
              variant="outline"
              onClick={() => void showHistory()}
            >
              {loadingHistory ? (
                <LoaderCircle className="animate-spin" />
              ) : history ? (
                <X />
              ) : (
                <History />
              )}
              {history ? 'Close history' : 'History'}
            </Button>
            <Button disabled={saving || !dirty} onClick={() => void save()}>
              {saving ? (
                <LoaderCircle className="animate-spin" />
              ) : saved ? (
                <Check />
              ) : null}
              {saving ? 'Saving' : 'Save'}
            </Button>
          </>
        }
      >
        <RepositoryPageTitle description=".pages.yml">
          Configuration
        </RepositoryPageTitle>
      </RepositoryPageHeader>

      <div className="mx-auto max-w-5xl space-y-5 p-4 md:p-6">
        <OperationError
          error={error}
          fallback="Could not update configuration."
        />

        {history ? (
          <section className="space-y-3 rounded-xl border bg-card p-4 shadow-xs">
            <h2 className="font-semibold">Configuration history</h2>
            {history.length ? (
              <ul className="divide-y">
                {history.map((commit) => (
                  <li className="flex items-start gap-3 py-3" key={commit.sha}>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {commit.message.split('\n')[0]}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {commit.authorName}
                        {commit.authoredAt
                          ? ` · ${new Date(commit.authoredAt).toLocaleString()}`
                          : ''}
                      </p>
                    </div>
                    <Button
                      asChild
                      aria-label="Open commit"
                      size="icon"
                      variant="ghost"
                    >
                      <a href={commit.url} rel="noreferrer" target="_blank">
                        <ExternalLink />
                      </a>
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No commits found.</p>
            )}
          </section>
        ) : null}

        <Textarea
          aria-label="Pages CMS configuration"
          className="min-h-[calc(100vh-10rem)] resize-y bg-card font-mono text-[13px] leading-6"
          placeholder={'media: public/images\ncontent: []\n'}
          spellCheck={false}
          value={source}
          onChange={(event) => {
            setSource(event.target.value)
            setSaved(false)
          }}
        />
      </div>
    </div>
  )
}

function ConfigurationSkeleton() {
  return (
    <div className="-m-4 md:-m-6" aria-label="Loading configuration">
      <RepositoryPageHeader actions={<Button disabled>Save</Button>}>
        <Skeleton className="h-5 w-40" />
      </RepositoryPageHeader>
      <div className="mx-auto max-w-5xl p-4 md:p-6">
        <Skeleton className="h-[70vh] w-full rounded-xl" />
      </div>
    </div>
  )
}
