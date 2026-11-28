import {
  Trans as UiTrans,
  useLingui as useUiMessages,
} from '@lingui/react/macro'
import { ConfigurationSetup } from './configuration-setup'
import { loadCodeEditor } from '#/features/editor/editor-component-loaders'
import {
  ConfigurationContribution,
  preloadConfigurationContribution,
} from './configuration-contribution'
import { configurationCompletion } from '#/lib/configuration-completion'
import { invalidateRepositories } from '#/client/queries/repository-invalidation'
import { repositoryRequest } from '#/lib/repository-identity'
import { useContentDraft } from '#/features/drafts/use-content-draft'
import { useDraftMerge } from '#/features/drafts/use-draft-merge'
import { isContentConflict } from '#/shared/content-conflict'
import {
  DraftBadge,
  DraftSaveButton,
} from '#/features/drafts/draft-save-button'
import { useUnsavedWarning } from '#/hooks/use-unsaved-warning'
import {
  operationKey,
  refreshQueries,
  useOperation,
} from '#/features/pending-writes/use-operation'
import { FileEditorHistory } from '#/components/file-editor-history'
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { EditorSkeleton } from '#/components/editor-skeleton'
import { createPortal } from 'react-dom'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'

import { OperationError } from '#/components/operation-error'
import { ButtonGroup } from '#/components/ui/button-group'
import {
  getConfigurationEditor,
  updateConfiguration,
} from '#/client/api/configuration'
import { validateConfigurationSource } from '#/shared/configuration-source'
import { configurationEditorQueryOptions } from '#/client/queries/content'
import { queryKeys } from '#/client/queries/keys'

import { EditorLayout } from '#/components/editor-layout'
import { FileEditorMenu } from '#/components/file-editor-menu'
import {
  RepositoryPageHeader,
  RepositoryPageTitle,
} from '#/components/repository-page-header'

const CodeEditor = lazy(loadCodeEditor)

export function ConfigurationPage({
  owner,
  repo,
  branch,
  repoId,
  source: provider,
  onDirtyChange,
  showGitHubLink = false,
}: {
  owner: string
  repo: string
  branch: string
  repoId?: string
  source?: string
  onDirtyChange?: (dirty: boolean) => void
  showGitHubLink?: boolean
}) {
  const { t: _t } = useUiMessages()
  useEffect(() => {
    void loadCodeEditor().catch(() => {})
    void preloadConfigurationContribution().catch(() => {})
  }, [])

  const params = { owner, repo, branch, repoId, source: provider }
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
  const [generating, setGenerating] = useState(false)
  const source = draft.value
  const merge = useDraftMerge(draft.session, 'Configuration')
  const setSource = draft.setValue
  const sha = draft.baseSha
  const saving = operation.pending || merge.loading
  const error = merge.error
  const diagnostics = useMemo(
    () => (draft.ready ? validateConfigurationSource(source).diagnostics : []),
    [draft.ready, source],
  )
  const errors = diagnostics.filter(
    (diagnostic) => diagnostic.severity === 'error',
  )
  const dirty = draft.dirty
  useUnsavedWarning(dirty || saving)
  useEffect(() => {
    onDirtyChange?.(dirty)
  }, [dirty, onDirtyChange])

  async function persist(handled = false) {
    const session = draft.session
    if (!session)
      throw new Error('Your draft is not ready. Reload and try again.')
    const { value: submitted, baseSha } = session.getSnapshot()
    if (
      validateConfigurationSource(submitted).diagnostics.some(
        (item) => item.severity === 'error',
      )
    )
      throw new Error('Fix the configuration errors before saving.')
    await operation.run({
      coordinates: params,
      paths: ['.pages.yml'],
      expectedAccount: session.summary.account,
      retain: () => session.retain(),
      successMessage: _t({ message: 'Configuration saved' }),
      handledError: (failure) =>
        draft.reportSaveError(failure) || handled || isContentConflict(failure),
      failureMessage: _t({
        message:
          'Could not update configuration. Your local draft is retained.',
      }),
      prepare: () => session.beginSave(submitted),
      run: () =>
        updateConfiguration({
          ...repositoryRequest(params),
          source: submitted,
          sha: baseSha,
        }),
      confirmed: async (result, active) => {
        if (active())
          queryClient.setQueryData(
            configurationEditorQueryOptions(params).queryKey,
            { source: submitted, sha: result.sha },
          )
        await session.acknowledge(submitted, submitted, result.sha)
        if (active()) {
          refreshQueries(queryClient, [queryKeys.branch(params)])
          void invalidateRepositories(queryClient, params).catch(() => {})
        }
      },
    })
  }

  async function save() {
    const session = draft.session
    if (errors.length || !session || !draft.ready || saving) return
    merge.clearError()
    try {
      await persist()
    } catch (cause) {
      await merge.handle(
        cause,
        async () => {
          const latest = await getConfigurationEditor(params)
          return {
            value: latest.source,
            sha: latest.sha,
            onApplied: () =>
              queryClient.setQueryData(
                configurationEditorQueryOptions(params).queryKey,
                latest,
              ),
          }
        },
        () => persist(true),
      )
    }
  }

  const [actionsTarget, setActionsTarget] = useState<HTMLDivElement | null>(
    null,
  )
  const controls = (
    <>
      <div ref={setActionsTarget} className="flex empty:hidden" />
      <DraftSaveButton
        draft={draft}
        busy={saving}
        invalid={errors.length > 0}
        disabled={generating}
        onSave={() => void save()}
      />
      <ButtonGroup
        aria-label={_t({ message: 'History and entry actions' })}
        className="empty:hidden"
      >
        {sha ? (
          <FileEditorHistory
            key={`${JSON.stringify(params)}:${sha}`}
            coordinates={{
              ...params,
              name: 'Configuration',
              path: '.pages.yml',
              configuration: true,
            }}
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
          <div className="flex min-w-0 items-center gap-2">
            <RepositoryPageTitle>
              <UiTrans>Configuration</UiTrans>
            </RepositoryPageTitle>
            <DraftBadge draft={draft} busy={saving || generating} />
          </div>
        </RepositoryPageHeader>
      }
    >
      <OperationError
        error={error}
        title={_t({ message: 'Could not review changes' })}
        fallback={_t({
          message:
            'Could not load the latest configuration. Your draft is retained.',
        })}
      />
      {merge.dialog}
      {!draft.ready && draft.error ? (
        <OperationError
          error={draft.error}
          title={_t({ message: 'Draft needs attention' })}
          fallback={_t({
            message:
              'Could not restore or save this draft. Keep this editor open.',
          })}
        />
      ) : !draft.ready ? (
        <EditorSkeleton
          label={_t({ message: 'Loading configuration' })}
          className="rounded-xl"
        />
      ) : (
        <Suspense
          fallback={
            <EditorSkeleton
              label={_t({ message: 'Loading configuration' })}
              className="rounded-xl"
            />
          }
        >
          <Suspense fallback={!sha ? <ConfigurationSetup /> : null}>
            <ConfigurationContribution
              owner={owner}
              repo={repo}
              branch={branch}
              repoId={repoId}
              source={source}
              disabled={saving}
              onChange={setSource}
              onBusyChange={setGenerating}
              setup={!sha ? <ConfigurationSetup /> : null}
              renderActions={(content) =>
                actionsTarget ? createPortal(content, actionsTarget) : null
              }
            />
          </Suspense>
          <CodeEditor
            placeholder={_t({
              message:
                'media: media\ncontent:\n  - name: posts\n    type: collection\n    path: content/posts',
            })}
            readOnly={generating}
            format="yaml"
            extraExtension={configurationCompletion}
            diagnostics={diagnostics}
            label={_t({ message: 'Configuration' })}
            value={source}
            className="rounded-xl bg-card [&_.cm-editor]:px-4! [&_.cm-editor]:py-3! [&_.cm-line]:px-0!"
            onChange={setSource}
          />
        </Suspense>
      )}
    </EditorLayout>
  )
}
