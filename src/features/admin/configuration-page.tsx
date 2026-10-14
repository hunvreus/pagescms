import { useContentDraft } from '#/features/drafts/use-content-draft'
import {
  ContentDraftRecovery,
  ContentDraftIndicator,
} from '#/features/drafts/content-draft-status'
import { useUnsavedWarning } from '#/hooks/use-unsaved-warning'
import {
  operationKey,
  refreshQueries,
  useOperation,
} from '#/features/operations/use-operation'
import { toast } from 'sonner'
import { FileEditorHistory } from '#/components/file-editor-history'
import { useEffect, useMemo, useState } from 'react'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { LoaderCircle } from 'lucide-react'

import { CodeEditor } from '#/components/code-editor'
import { OperationError } from '#/components/operation-error'
import { Button } from '#/components/ui/button'
import { ButtonGroup } from '#/components/ui/button-group'
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
  const operation = useOperation<
    Awaited<ReturnType<typeof updateConfiguration>>
  >(operationKey('configuration-save', params))
  const draft = useContentDraft({
    target: {
      ...params,
      name: 'Configuration',
      path: '.pages.yml',
      kind: 'configuration',
    },
    schema: { mode: 'configuration' },
    initialValue: initial.source,
    initialSha: initial.sha,
    title: 'Configuration',
  })
  const source = draft.value
  const setSource = draft.setValue
  const sha = draft.baseSha
  const saving = operation.pending
  const [localError, setLocalError] = useState<unknown>(null)
  const error = localError ?? operation.error
  const diagnostics = useMemo(
    () => validateConfigurationSource(source).diagnostics,
    [source],
  )
  const errors = diagnostics.filter(
    (diagnostic) => diagnostic.severity === 'error',
  )
  const dirty = draft.dirty
  useUnsavedWarning(dirty || saving)
  useEffect(() => {
    onDirtyChange?.(dirty)
  }, [dirty, onDirtyChange])

  async function save() {
    const session = draft.session
    if (errors.length || !session || !draft.ready || operation.pending) return
    const { value: submitted, baseSha } = session.getSnapshot()
    setLocalError(null)
    try {
      await operation.run({
        coordinates: params,
        paths: ['.pages.yml'],
        expectedAccount: session.summary.account,
        retain: () => session.retain(),
        failureMessage:
          'Could not update configuration. Your local draft is retained.',
        prepare: () => session.beginSave(submitted),
        run: () =>
          updateConfiguration({
            data: { ...params, source: submitted, sha: baseSha },
          }),
        confirmed: async (result, active) => {
          if (active())
            queryClient.setQueryData(
              configurationEditorQueryOptions(params).queryKey,
              { source: submitted, sha: result.sha },
            )
          await session.acknowledge(submitted, submitted, result.sha)
          if (active()) {
            toast.success('Configuration saved')
            refreshQueries(queryClient, [queryKeys.branch(params)])
          }
        },
      })
    } catch (cause) {
      setLocalError(cause)
    }
  }

  const controls = (
    <>
      <div className="flex items-center gap-2">
        <ContentDraftIndicator draft={draft} saving={saving} />
        <Button
          disabled={saving || !dirty || !draft.ready || errors.length > 0}
          onClick={() => void save()}
        >
          {saving ? <LoaderCircle className="animate-spin" /> : null}
          {saving ? 'Saving' : 'Save'}
        </Button>
      </div>
      <ButtonGroup
        aria-label="History and entry actions"
        className="empty:hidden"
      >
        {sha ? (
          <FileEditorHistory
            key={`${JSON.stringify(params)}:${sha}`}
            load={(page) =>
              getConfigurationHistory({ data: { ...params, page } })
            }
          />
        ) : null}
        <FileEditorMenu
          disabled={saving}
          href={
            showGitHubLink && sha
              ? `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/blob/${encodeURIComponent(branch)}/.pages.yml`
              : undefined
          }
        />
      </ButtonGroup>
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
      <ContentDraftRecovery draft={draft} />
      <CodeEditor
        disabled={!draft.ready}
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
