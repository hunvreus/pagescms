import { useMemo, useState } from 'react'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { ExternalLink, History, LoaderCircle } from 'lucide-react'

import { CodeEditor } from '#/components/code-editor'
import { OperationError } from '#/components/operation-error'
import { Button } from '#/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { FieldError } from '#/components/ui/field'
import {
  getConfigurationHistory,
  updateConfiguration,
} from '#/functions/configuration-editor'
import { useUnsavedWarning } from '#/hooks/use-unsaved-warning'
import { validateConfigurationSource } from '#/lib/configuration-source'
import { configurationEditorQueryOptions } from '#/queries/content'
import { queryKeys } from '#/queries/keys'

import { RepositoryAdminPage } from './repository-admin-page'

export function ConfigurationPage({
  owner,
  repo,
  branch,
}: {
  owner: string
  repo: string
  branch: string
}) {
  const params = { owner, repo, branch }
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
  const diagnostics = useMemo(
    () => validateConfigurationSource(source).diagnostics,
    [source],
  )
  const errors = diagnostics.filter(
    (diagnostic) => diagnostic.severity === 'error',
  )
  const dirty = source !== savedSource

  useUnsavedWarning(dirty)

  async function save() {
    if (errors.length) return
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

  async function loadHistory() {
    if (history || loadingHistory) return
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
    <RepositoryAdminPage
      className="max-w-none"
      title="Configuration"
      actions={
        <>
          <DropdownMenu onOpenChange={(open) => open && void loadHistory()}>
            <DropdownMenuTrigger asChild>
              <Button
                aria-label="Configuration history"
                size="icon"
                variant="outline"
              >
                {loadingHistory ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <History />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
              <DropdownMenuLabel>Configuration history</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {loadingHistory ? (
                <DropdownMenuItem disabled>Loading history…</DropdownMenuItem>
              ) : history?.length ? (
                history.map((commit) => (
                  <DropdownMenuItem asChild key={commit.sha}>
                    <a
                      className="flex items-start justify-between gap-3"
                      href={commit.url}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <span className="min-w-0">
                        <span className="block truncate">
                          {commit.message.split('\n')[0]}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {commit.authorName}
                          {commit.authoredAt
                            ? ` · ${new Date(commit.authoredAt).toLocaleString()}`
                            : ''}
                        </span>
                      </span>
                      <ExternalLink className="mt-0.5 shrink-0" />
                    </a>
                  </DropdownMenuItem>
                ))
              ) : (
                <DropdownMenuItem disabled>No history found.</DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            disabled={saving || !dirty || errors.length > 0}
            onClick={() => void save()}
          >
            {saving ? <LoaderCircle className="animate-spin" /> : null}
            {saving ? 'Saving' : saved && !dirty ? 'Saved' : 'Save'}
          </Button>
        </>
      }
    >
      <OperationError
        error={error}
        fallback="Could not update configuration."
      />
      <div className="space-y-2">
        <CodeEditor
          configuration
          format="yaml"
          diagnostics={diagnostics}
          label="Pages CMS configuration"
          value={source}
          onChange={(value) => {
            setSource(value)
            setSaved(false)
          }}
        />
        <FieldError
          errors={errors.map((diagnostic) => ({ message: diagnostic.message }))}
        />
      </div>
    </RepositoryAdminPage>
  )
}
