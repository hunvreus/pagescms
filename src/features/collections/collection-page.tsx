import { CollectionHeader, CollectionLayout } from './collection-header'
import { plural } from '@lingui/core/macro'
import { joinGitPath } from '#/shared/git-path'
import {
  Trans as UiTrans,
  useLingui as useUiMessages,
} from '@lingui/react/macro'
import { authenticationQueryOptions } from '#/client/queries/session'
import {
  collectionLocalePreference,
  rememberTranslationPreference,
} from '#/features/editor/translation-preferences'
import { repositoryIdentityKey } from '#/lib/repository-identity'
import { parseLocalizedPath, localizedPath } from '#/lib/i18n'
import { Spinner } from '#/components/ui/spinner'
import { HugeiconsIcon } from '@hugeicons/react'
import ChevronDown from '@hugeicons/core-free-icons/ChevronDownIcon'
import { useRepositoryCoordinates } from '#/hooks/use-repository-coordinates'
import { useEntryActions } from '#/features/content/use-entry-actions'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  operationKey,
  refreshQueries,
  useOperation,
} from '#/features/pending-writes/use-operation'
import {
  keepPreviousData,
  useQueryClient,
  useQuery,
} from '@tanstack/react-query'
import { getRouteApi, useRouter } from '@tanstack/react-router'

import { isContentField } from '#/lib/content-field'
import { notifyError } from '#/lib/notifications'
import { ErrorAlert } from '#/components/error-alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '#/components/ui/alert-dialog'
import { Button } from '#/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '#/components/ui/collapsible'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { Field, FieldLabel } from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import { CollectionTable } from '#/features/collections/collection-table'
import { collectionViewModel } from '#/features/collections/collection-model'
import { getCollection } from '#/client/api/collections'
import { createCollectionFolder } from '#/client/api/entry-write'
import { collectionQueryOptions } from '#/client/queries/content'
import { queryKeys } from '#/client/queries/keys'

type CollectionData = Awaited<ReturnType<typeof getCollection>>
type CollectionItem = CollectionData['contents'][number]

interface ExpandedCollection {
  loading: boolean
  contents?: CollectionItem[]
  parseErrorPaths?: string[]
  request?: { path: string; locale?: string }
}

const Route = getRouteApi('/github/$owner/$repo/$branch/collection/$name')

export function CollectionPage({
  data: loaded,
}: {
  data: Awaited<ReturnType<typeof getCollection>>
}) {
  const { t: _t } = useUiMessages()

  const params = useRepositoryCoordinates(Route.useParams())
  const search = Route.useSearch()
  const { collectionLocale } = Route.useRouteContext()
  const router = useRouter()
  const queryClient = useQueryClient()
  const entryActions = useEntryActions()
  const auth = useQuery(authenticationQueryOptions())
  const collectionQuery = useQuery({
    ...collectionQueryOptions({
      ...params,
      path: search.path,
      locale: collectionLocale,
    }),
    placeholderData: keepPreviousData,
  })
  const data = collectionQuery.data ?? loaded
  const isFetching = collectionQuery.isFetching
  const preferenceScope = `collection:${JSON.stringify([repositoryIdentityKey(params), params.branch, params.name])}`
  const restored = useRef<string | null>(null)
  useEffect(() => {
    if (!auth.data?.user) return
    const scope = JSON.stringify([auth.data.user.id, preferenceScope])
    if (restored.current === scope) return
    restored.current = scope
    const remembered = collectionLocalePreference(
      auth.data.user.id,
      preferenceScope,
      data.collection.i18n,
    )
    if (remembered && search.locale === undefined) {
      void router.navigate({
        to: '.',
        search: { ...search, locale: remembered },
        replace: true,
        resetScroll: false,
      })
    }
  }, [
    auth.data?.user?.id,
    preferenceScope,
    search.locale,
    data.collection.i18n,
    router,
  ])
  const fields = useMemo(
    () =>
      Array.isArray(data.collection.fields)
        ? data.collection.fields.filter(isContentField)
        : [],
    [data.collection.fields],
  )
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [parseErrorsOpen, setParseErrorsOpen] = useState(false)
  const [refreshingFiles, setRefreshingFiles] = useState(false)
  const [folder, setFolder] = useState('')
  const folderCreation = useOperation<
    Awaited<ReturnType<typeof createCollectionFolder>>
  >(operationKey('collection-folder', params))
  const [entrySaving, setSaving] = useState(false)
  const saving = entrySaving || folderCreation.pending
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const [expanded, setExpanded] = useState<
    Partial<Record<string, ExpandedCollection>>
  >({})
  const refreshScope = JSON.stringify([params, search.path, collectionLocale])
  const currentRefreshScope = useRef(refreshScope)
  currentRefreshScope.current = refreshScope
  useEffect(() => setRefreshingFiles(false), [refreshScope])
  const [renaming, setRenaming] = useState<
    Extract<CollectionItem, { type: 'file' }> | undefined
  >()
  const [deleting, setDeleting] = useState<
    Extract<CollectionItem, { type: 'file' }> | undefined
  >()
  const [promoting, setPromoting] = useState<
    Extract<CollectionItem, { type: 'file' }> | undefined
  >()
  const [renamedFilename, setRenamedFilename] = useState('')
  const view =
    data.collection.view &&
    typeof data.collection.view === 'object' &&
    !Array.isArray(data.collection.view)
      ? data.collection.view
      : undefined
  const tableModel = useMemo(
    () =>
      collectionViewModel({ fields, filename: data.collection.filename, view }),
    [data.collection.filename, fields, view],
  )
  const [tableSearch, setTableSearch] = useState(tableModel.initial.search)
  const nodeView =
    view?.node && typeof view.node === 'object' && !Array.isArray(view.node)
      ? view.node
      : undefined
  const nodeFilename =
    typeof nodeView?.filename === 'string' ? nodeView.filename : undefined

  useEffect(() => {
    setExpanded({})
    setTableSearch(tableModel.initial.search)
  }, [
    data.collection.name,
    data.collection.path,
    params.branch,
    params.owner,
    params.repo,
    tableModel.initial.search,
  ])

  useEffect(() => {
    setExpanded({})
  }, [data.collection.locale])

  const currentDirectory = search.path ?? data.collection.rootPath
  const creatorHref = useCallback(
    (parent = currentDirectory) => {
      const pathname = `/github/${encodeURIComponent(params.owner)}/${encodeURIComponent(params.repo)}/${encodeURIComponent(params.branch)}/collection/${encodeURIComponent(params.name)}/new`
      const creationLocale = data.collection.locale ?? undefined
      const query = new URLSearchParams({
        ...(parent !== data.collection.rootPath ? { parent } : {}),
        ...(creationLocale ? { locale: creationLocale } : {}),
      })
      return `${pathname}${query.size ? '?' + query : ''}`
    },
    [params, data.collection, currentDirectory],
  )

  const toggleTreeEntry = useCallback(
    async (entry: CollectionItem) => {
      if (entry.type !== 'dir' && !entry.isNode) return
      const key = entry.path
      const current = expanded[key]
      if (current?.contents) return
      setExpanded((values) => ({
        ...values,
        [key]: { loading: true },
      }))
      try {
        const request = {
          locale: data.collection.locale ?? undefined,
          path: entry.type === 'file' ? entry.parentPath : entry.path,
        }
        const result = await queryClient.ensureQueryData(
          collectionQueryOptions({
            ...params,
            ...request,
          }),
        )
        setExpanded((values) => ({
          ...values,
          [key]: {
            loading: false,
            contents: result.contents,
            parseErrorPaths: result.parseErrorPaths,
            request,
          },
        }))
      } catch (cause) {
        setExpanded((values) => ({
          ...values,
          [key]: { loading: false },
        }))
        throw cause
      }
    },
    [expanded, queryClient, params, data.collection.locale],
  )

  async function promoteToNode(
    entry: Extract<CollectionItem, { type: 'file' }>,
  ) {
    if (!nodeFilename || !entry.sha) return
    const extension = data.collection.extension
      ? `.${data.collection.extension}`
      : ''
    const schema = {
      type: 'collection',
      path: data.collection.rootPath,
      i18n: data.collection.i18n,
    }
    const parsed =
      data.collection.i18n?.scheme === 'files'
        ? parseLocalizedPath(schema, entry.path)
        : undefined
    const canonical = parsed?.canonical ?? entry.path
    const basePath =
      extension && canonical.endsWith(extension)
        ? canonical.slice(0, -extension.length)
        : canonical
    const newPath = localizedPath(
      schema,
      `${basePath}/${nodeFilename}`,
      parsed?.locale ?? data.collection.locale ?? '',
    )
    const origin = router.state.location.href
    try {
      setSaving(true)
      const result = await entryActions.changePath(
        { ...params, path: entry.path },
        entry.sha,
        { newPath },
      )
      if (
        result === null ||
        !mounted.current ||
        router.state.location.href !== origin
      )
        return
      refreshQueries(queryClient, [queryKeys.branch(params)])
      setPromoting(undefined)
      void router.navigate({ to: creatorHref(basePath) })
    } catch {
      // The action boundary reports this failure.
    } finally {
      setSaving(false)
    }
  }

  async function createFolder() {
    const origin = router.state.location.href
    const submittedFolder = folder
    const parent = currentDirectory
    try {
      await folderCreation.run({
        failureMessage: _t({ message: 'Could not create folder.' }),
        successMessage: _t({ message: 'Folder created' }),
        coordinates: params,
        paths: [joinGitPath(parent, submittedFolder, '.gitkeep')],
        run: () =>
          createCollectionFolder({
            ...params,
            parent,
            folder: submittedFolder,
            locale: data.collection.locale ?? undefined,
          }),
        confirmed: async (_result, active) => {
          if (!active()) return
          refreshQueries(queryClient, [queryKeys.branch(params)])
          if (!mounted.current || router.state.location.href !== origin) return
          setCreatingFolder(false)
          setFolder('')
        },
      })
    } catch {
      // The action boundary reports this failure.
    }
  }

  async function commitRename() {
    if (!renaming?.sha || !renamedFilename.trim() || saving) return
    setSaving(true)
    try {
      const renamed = await entryActions.changeName(
        { ...params, path: renaming.path },
        renaming.sha,
        renamedFilename.trim(),
      )
      if (renamed !== null) setRenaming(undefined)
    } catch {
      // The action boundary reports this failure.
    } finally {
      setSaving(false)
    }
  }
  async function confirmDelete() {
    if (!deleting?.sha || saving) return
    setSaving(true)
    try {
      await entryActions.remove(
        { ...params, path: deleting.path },
        deleting.sha,
      )
      setDeleting(undefined)
    } catch {
      // The action boundary reports this failure.
    } finally {
      setSaving(false)
    }
  }

  const childRows = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(expanded).flatMap(([path, state]) =>
          state?.contents ? [[path, state.contents]] : [],
        ),
      ),
    [expanded],
  )
  const loadingRows = useMemo(
    () =>
      new Set(
        Object.entries(expanded).flatMap(([path, state]) =>
          state?.loading ? [path] : [],
        ),
      ),
    [expanded],
  )

  const canAddChild = useCallback(
    (entry: CollectionItem) =>
      tableModel.layout === 'tree' &&
      (entry.type === 'dir' ||
        entry.isNode ||
        Boolean(nodeFilename && data.collection.operations.rename)),
    [tableModel.layout, nodeFilename, data.collection.operations.rename],
  )

  const addChild = useCallback(
    (entry: CollectionItem) => {
      if (
        entry.type === 'file' &&
        !entry.isNode &&
        nodeFilename &&
        data.collection.operations.rename
      ) {
        setPromoting(entry)
        return
      }
      void router.navigate({
        to: creatorHref(entry.type === 'file' ? entry.parentPath : entry.path),
      })
    },
    [nodeFilename, data.collection.operations.rename, router, creatorHref],
  )

  const startRename = useCallback(
    (entry: Extract<CollectionItem, { type: 'file' }>) => {
      setRenaming(entry)
      setRenamedFilename(entry.name)
    },
    [],
  )
  const parseErrorPaths = [
    ...new Set([
      ...data.parseErrorPaths,
      ...Object.values(expanded).flatMap(
        (entry) => entry?.parseErrorPaths ?? [],
      ),
    ]),
  ]

  async function refreshFiles() {
    setRefreshingFiles(true)
    const scope = refreshScope
    const requests = [
      { ...params, path: search.path, locale: collectionLocale },
      ...Object.values(expanded).flatMap((entry) =>
        entry?.request && entry.parseErrorPaths?.length
          ? [{ ...params, ...entry.request }]
          : [],
      ),
    ]
    const uniqueRequests = new Map(
      requests.map((request) => [
        JSON.stringify(collectionQueryOptions(request).queryKey),
        request,
      ]),
    )
    const results = await Promise.allSettled(
      [...uniqueRequests.values()].map(async (request) => {
        const queryKey = collectionQueryOptions(request).queryKey
        await queryClient.cancelQueries({ queryKey, exact: true })
        const result = await getCollection({ ...request, forceRefresh: true })
        queryClient.setQueryData(queryKey, result)
        if (mounted.current && currentRefreshScope.current === scope) {
          setExpanded((values) =>
            Object.fromEntries(
              Object.entries(values).map(([key, entry]) => [
                key,
                entry?.request &&
                JSON.stringify(
                  collectionQueryOptions({ ...params, ...entry.request })
                    .queryKey,
                ) === JSON.stringify(queryKey)
                  ? {
                      ...entry,
                      contents: result.contents,
                      parseErrorPaths: result.parseErrorPaths,
                    }
                  : entry,
              ]),
            ),
          )
        }
      }),
    )
    if (mounted.current && currentRefreshScope.current === scope) {
      setRefreshingFiles(false)
      const failed = results.find((result) => result.status === 'rejected')
      if (failed?.status === 'rejected')
        notifyError(failed.reason, _t({ message: 'Could not refresh files.' }))
    }
  }

  return (
    <CollectionLayout>
      <CollectionHeader
        collection={data.collection}
        params={params}
        filter={tableSearch}
        onFilterChange={setTableSearch}
        refreshing={isFetching}
        locale={collectionLocale}
        onLocaleChange={(locale) => {
          rememberTranslationPreference(
            auth.data?.user?.id,
            preferenceScope,
            locale,
          )
          void router.navigate({
            to: '.',
            search: { ...search, locale },
            resetScroll: false,
          })
        }}
        onNewFolder={() => {
          setFolder('')
          setCreatingFolder(true)
        }}
        createHref={
          data.collection.operations.create ? creatorHref() : undefined
        }
      />

      <Dialog
        open={creatingFolder}
        onOpenChange={(open) => {
          setCreatingFolder(open)
          if (!open) {
            setFolder('')
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              <UiTrans>Create a folder</UiTrans>
            </DialogTitle>
            <DialogDescription>
              <UiTrans>Choose a path under {data.collection.path}.</UiTrans>
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault()
              void createFolder()
            }}
          >
            <Field>
              <FieldLabel htmlFor="new-folder-path">
                <UiTrans>Folder path</UiTrans>
              </FieldLabel>
              <Input
                autoFocus
                id="new-folder-path"
                required
                placeholder={_t({ message: 'drafts or 2026/launches' })}
                value={folder}
                onChange={(event) => setFolder(event.target.value)}
              />
            </Field>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreatingFolder(false)}
              >
                <UiTrans>Cancel</UiTrans>
              </Button>
              <Button
                aria-busy={saving}
                disabled={saving || !folder.trim()}
                type="submit"
              >
                <UiTrans>Create folder</UiTrans>
                {saving ? (
                  <Spinner aria-hidden="true" data-icon="inline-end" />
                ) : null}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {parseErrorPaths.length ? (
        <Collapsible open={parseErrorsOpen} onOpenChange={setParseErrorsOpen}>
          <ErrorAlert
            title={<UiTrans>Some files may not load properly</UiTrans>}
            action={
              <div className="text-foreground">
                <Button
                  aria-busy={refreshingFiles}
                  disabled={refreshingFiles}
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={() => void refreshFiles()}
                >
                  <UiTrans>Refresh</UiTrans>
                  {refreshingFiles ? (
                    <Spinner aria-hidden="true" data-icon="inline-end" />
                  ) : null}
                </Button>
              </div>
            }
          >
            {parseErrorPaths.length === 1 ? (
              <div>
                <UiTrans>
                  We couldn't read {parseErrorPaths[0]}. Some fields may be
                  missing.
                </UiTrans>
              </div>
            ) : (
              <>
                <div>
                  {_t({
                    message: plural(parseErrorPaths.length, {
                      one: "We couldn't read # file. Some fields may be missing.",
                      other:
                        "We couldn't read # files. Some fields may be missing.",
                    }),
                  })}
                </div>
                <ul className="list-disc pl-4">
                  {parseErrorPaths.slice(0, 3).map((path) => (
                    <li key={path} className="break-all">
                      {path}
                    </li>
                  ))}
                </ul>
                {parseErrorPaths.length > 3 ? (
                  <>
                    <CollapsibleContent>
                      <ul className="list-disc pl-4">
                        {parseErrorPaths.slice(3).map((path) => (
                          <li key={path} className="break-all">
                            {path}
                          </li>
                        ))}
                      </ul>
                    </CollapsibleContent>
                    <CollapsibleTrigger
                      data-alert-link
                      className="inline-flex items-center gap-1 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:[&>svg]:rotate-180"
                    >
                      {parseErrorsOpen
                        ? _t({ message: 'Show fewer files' })
                        : _t({ message: 'See all files' })}
                      <HugeiconsIcon
                        aria-hidden="true"
                        icon={ChevronDown}
                        className="size-4"
                      />
                    </CollapsibleTrigger>
                  </>
                ) : null}
              </>
            )}
          </ErrorAlert>
        </Collapsible>
      ) : null}

      <div aria-busy={isFetching} inert={collectionQuery.isPlaceholderData}>
        <CollectionTable
          collection={data.collection}
          locale={data.collection.locale ?? undefined}
          key={`${params.owner}:${params.repo}:${params.branch}:${data.collection.name}:${data.collection.path}`}
          canAddChild={canAddChild}
          canCreate={data.collection.operations.create}
          canDelete={data.collection.operations.delete}
          canRename={data.collection.operations.rename}
          children={childRows}
          data={data.contents}
          directory={data.collection.path}
          loading={loadingRows}
          media={data.media}
          model={tableModel}
          repository={params}
          search={tableSearch}
          onSearchChange={setTableSearch}
          onAddChild={addChild}
          onDelete={setDeleting}
          onExpand={toggleTreeEntry}
          readError={
            collectionQuery.error
              ? {
                  message: _t({
                    message:
                      'Could not load this language. Previous results are still shown.',
                  }),
                  onRetry: () => void collectionQuery.refetch(),
                  retrying: isFetching,
                }
              : undefined
          }
          onRename={startRename}
        />
      </div>

      {entryActions.confirmationDialog}
      <Dialog
        open={Boolean(renaming)}
        onOpenChange={(open) => {
          if (!open) setRenaming(undefined)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              <UiTrans>Rename entry</UiTrans>
            </DialogTitle>
            <DialogDescription>
              <UiTrans>Change the filename for {renaming?.name}.</UiTrans>
            </DialogDescription>
          </DialogHeader>
          <form
            className="contents"
            onSubmit={(event) => {
              event.preventDefault()
              void commitRename()
            }}
          >
            <Field>
              <FieldLabel htmlFor="collection-entry-filename">
                <UiTrans>Filename</UiTrans>
              </FieldLabel>
              <Input
                id="collection-entry-filename"
                required
                value={renamedFilename}
                onChange={(event) => setRenamedFilename(event.target.value)}
              />
            </Field>
            <DialogFooter showCloseButton>
              <Button
                aria-busy={saving}
                disabled={saving || !renamedFilename.trim()}
                type="submit"
              >
                <UiTrans>Rename</UiTrans>
                {saving ? (
                  <Spinner aria-hidden="true" data-icon="inline-end" />
                ) : null}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(promoting)}
        onOpenChange={(open) => {
          if (!open) setPromoting(undefined)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              <UiTrans>Move this entry first?</UiTrans>
            </AlertDialogTitle>
            <AlertDialogDescription>
              {promoting && nodeFilename
                ? _t({
                    message: `${promoting.path} must become a node entry before it can contain children.`,
                  })
                : _t({
                    message:
                      'This entry must become a node before it can contain children.',
                  })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              <UiTrans>Cancel</UiTrans>
            </AlertDialogCancel>
            <AlertDialogAction
              aria-busy={saving}
              disabled={saving}
              onClick={() => {
                if (promoting) void promoteToNode(promoting)
              }}
            >
              <UiTrans>Move and continue</UiTrans>
              {saving ? (
                <Spinner aria-hidden="true" data-icon="inline-end" />
              ) : null}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open) setDeleting(undefined)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              <UiTrans>Delete entry?</UiTrans>
            </AlertDialogTitle>
            <AlertDialogDescription>
              <UiTrans>
                This will delete {deleting?.name} from the repository. This
                action cannot be undone here. If this entry has a local draft,
                it will also be discarded.
              </UiTrans>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              <UiTrans>Cancel</UiTrans>
            </AlertDialogCancel>
            <AlertDialogAction
              aria-busy={saving}
              disabled={saving}
              variant="destructive"
              onClick={() => void confirmDelete()}
            >
              <UiTrans>Delete</UiTrans>
              {saving ? (
                <Spinner aria-hidden="true" data-icon="inline-end" />
              ) : null}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </CollectionLayout>
  )
}
