import { useEffect, useState } from 'react'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import {
  Check,
  ExternalLink,
  History,
  LoaderCircle,
  Save,
  X,
} from 'lucide-react'

import { Button } from '#/components/ui/button'
import { OperationError } from '#/components/operation-error'
import { Textarea } from '#/components/ui/textarea'
import {
  getConfigurationHistory,
  updateConfiguration,
} from '#/functions/configuration-editor'
import { getSignInUrl } from '#/lib/auth-redirect'
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

  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

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
    <div className="mx-auto max-w-5xl space-y-5">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">.pages.yml</p>
          <h1 className="text-2xl font-semibold tracking-tight">
            Configuration
          </h1>
        </div>
        <div className="flex gap-2">
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
            ) : (
              <Save />
            )}
            {saving ? 'Saving' : 'Save'}
          </Button>
        </div>
      </header>

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
  )
}

function ConfigurationSkeleton() {
  return (
    <div
      className="mx-auto max-w-5xl animate-pulse space-y-5"
      aria-label="Loading configuration"
    >
      <div className="h-8 w-48 rounded bg-muted" />
      <div className="h-[70vh] rounded-xl border bg-card" />
    </div>
  )
}
