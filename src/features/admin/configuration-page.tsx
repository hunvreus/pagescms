import { useEffect, useMemo, useState } from 'react'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { ArrowUpRight, LoaderCircle } from 'lucide-react'

import { CodeEditor } from '#/components/code-editor'
import { OperationError } from '#/components/operation-error'
import { Button } from '#/components/ui/button'
import { updateConfiguration } from '#/functions/configuration-editor'
import { useUnsavedWarning } from '#/hooks/use-unsaved-warning'
import { validateConfigurationSource } from '#/lib/configuration-source'
import { configurationEditorQueryOptions } from '#/queries/content'
import { queryKeys } from '#/queries/keys'

import { RepositoryAdminPage } from './repository-admin-page'

export function ConfigurationPage({
  owner,
  repo,
  branch,
  embedded = false,
  onDirtyChange,
  inline = false,
  editing = true,
  onEdit,
  onDone,
  onCancel,
  showGitHubLink = false,
}: {
  owner: string
  repo: string
  branch: string
  embedded?: boolean
  onDirtyChange?: (dirty: boolean) => void
  inline?: boolean
  editing?: boolean
  onEdit?: () => void
  onDone?: () => void
  onCancel?: () => void
  showGitHubLink?: boolean
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
  const [error, setError] = useState<unknown>(null)
  const diagnostics = useMemo(
    () => validateConfigurationSource(source).diagnostics,
    [source],
  )
  const errors = diagnostics.filter(
    (diagnostic) => diagnostic.severity === 'error',
  )
  const dirty = source !== savedSource
  useEffect(() => {
    if (inline && !editing) {
      setSource(savedSource)
      setError(null)
    }
  }, [inline, editing, savedSource])
  useEffect(() => {
    onDirtyChange?.(dirty)
  }, [dirty, onDirtyChange])

  useUnsavedWarning(dirty)

  async function save() {
    if (errors.length) return
    setSaving(true)
    setError(null)
    try {
      const result = await updateConfiguration({
        data: { ...params, source, sha },
      })
      setSha(result.sha)
      setSavedSource(source)
      await queryClient.invalidateQueries({
        queryKey: queryKeys.branch(params),
      })
      onDone?.()
    } catch (cause) {
      setError(cause)
    } finally {
      setSaving(false)
    }
  }

  const controls = (
    <>
      {showGitHubLink ? (
        <Button asChild size="sm" variant="ghost">
          <a
            aria-label="View configuration on GitHub"
            href={`https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/blob/${encodeURIComponent(branch)}/.pages.yml`}
            target="_blank"
            rel="noreferrer"
          >
            View on GitHub <ArrowUpRight data-icon="inline-end" />
          </a>
        </Button>
      ) : null}
      {onCancel && editing ? (
        <Button
          size={inline ? 'sm' : 'default'}
          variant="outline"
          onClick={onCancel}
          disabled={saving}
        >
          Cancel
        </Button>
      ) : null}
      {inline && !editing ? (
        <Button size="sm" variant="outline" onClick={onEdit}>
          Edit configuration
        </Button>
      ) : (
        <Button
          size={inline ? 'sm' : 'default'}
          disabled={saving || !dirty || errors.length > 0}
          onClick={() => void save()}
        >
          {saving ? <LoaderCircle className="animate-spin" /> : null}
          {saving ? 'Saving' : 'Save'}
        </Button>
      )}
    </>
  )

  return (
    <RepositoryAdminPage
      embedded={embedded}
      hideHeading={embedded && !inline}
      className="max-w-none"
      title="Configuration"
      actions={inline || !embedded ? controls : undefined}
    >
      <OperationError
        error={error}
        fallback="Could not update configuration."
      />
      <div className="space-y-2">
        <div
          className={inline ? `relative ${editing ? '' : 'h-40'}` : undefined}
          data-slot="configuration-preview"
          data-editing={editing}
        >
          <CodeEditor
            format="yaml"
            diagnostics={editing ? diagnostics : []}
            label="Pages CMS configuration"
            value={
              inline && !editing
                ? savedSource.split('\n').slice(0, 8).join('\n')
                : source
            }
            disabled={inline && !editing}
            autoFocus={inline && editing}
            className={
              inline
                ? `rounded-xl bg-card [&_.cm-editor]:px-4! [&_.cm-editor]:py-3! [&_.cm-line]:px-0! ${editing ? 'min-h-40' : 'h-40 pointer-events-none border-border opacity-100 [&_.cm-editor]:h-full [&_.cm-scroller]:overflow-hidden'}`
                : undefined
            }
            onChange={setSource}
          />
          {inline && !editing ? (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-px bottom-px h-12 rounded-b-xl bg-gradient-to-t from-card to-transparent"
            />
          ) : null}
        </div>
      </div>
    </RepositoryAdminPage>
  )
}
