import { toast } from 'sonner'
import { FileEditorHistory } from '#/components/file-editor-history'
import { useEffect, useMemo, useState } from 'react'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { LoaderCircle } from 'lucide-react'

import { CodeEditor } from '#/components/code-editor'
import { OperationError } from '#/components/operation-error'
import { Button } from '#/components/ui/button'
import {
  getConfigurationHistory,
  updateConfiguration,
} from '#/functions/configuration-editor'
import { validateConfigurationSource } from '#/lib/configuration-source'
import { configurationEditorQueryOptions } from '#/queries/content'
import { queryKeys } from '#/queries/keys'

import { EditorLayout } from '#/components/editor-layout'
import { FileEditorMenu } from '#/components/file-editor-menu'
import {
  RepositoryPageHeader,
  RepositoryPageTitle,
} from '#/components/repository-page-header'

export function ConfigurationPage({
  owner,
  repo,
  branch,
  onDirtyChange,
  showGitHubLink = false,
}: {
  owner: string
  repo: string
  branch: string
  onDirtyChange?: (dirty: boolean) => void
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
    onDirtyChange?.(dirty)
  }, [dirty, onDirtyChange])

  async function save() {
    if (errors.length) return
    setSaving(true)
    setError(null)
    try {
      const result = await updateConfiguration({
        data: { ...params, source, sha },
      })
      toast.success('Configuration saved')
      setSha(result.sha)
      setSavedSource(source)
      await queryClient.invalidateQueries({
        queryKey: queryKeys.branch(params),
      })
    } catch (cause) {
      setError(cause)
    } finally {
      setSaving(false)
    }
  }

  const controls = (
    <>
      {sha ? (
        <FileEditorHistory
          coordinates={{ ...params, path: '.pages.yml' }}
          load={() => getConfigurationHistory({ data: params })}
        />
      ) : null}
      <Button
        disabled={saving || !dirty || errors.length > 0}
        onClick={() => void save()}
      >
        {saving ? <LoaderCircle className="animate-spin" /> : null}
        {saving ? 'Saving' : 'Save'}
      </Button>
      <FileEditorMenu
        disabled={saving}
        href={
          showGitHubLink && sha
            ? `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/blob/${encodeURIComponent(branch)}/.pages.yml`
            : undefined
        }
      />
    </>
  )

  return (
    <EditorLayout
      header={
        <RepositoryPageHeader actions={controls}>
          <RepositoryPageTitle>Configuration</RepositoryPageTitle>
        </RepositoryPageHeader>
      }
    >
      <OperationError
        error={error}
        fallback="Could not update configuration."
      />
      <CodeEditor
        format="yaml"
        diagnostics={diagnostics}
        label="Pages CMS configuration"
        value={source}
        className="rounded-xl bg-card [&_.cm-editor]:px-4! [&_.cm-editor]:py-3! [&_.cm-line]:px-0!"
        onChange={setSource}
      />
    </EditorLayout>
  )
}
