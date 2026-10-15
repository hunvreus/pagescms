import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useBlocker } from '@tanstack/react-router'
import { authenticationQueryOptions } from '#/queries/session'
import { repositoryWorkspaceQueryOptions } from '#/queries/repository'
import { DraftSession } from './draft-session'
import type { DraftState } from './draft-session'
import type { DraftTarget } from './draft-store'
import type { QueryClient } from '@tanstack/react-query'

const sessions = new WeakMap<QueryClient, Map<string, DraftSession<unknown>>>()
const noopSubscribe = () => () => {}

export function useContentDraft<T>({
  target,
  schema,
  initialValue,
  initialSha,
  title,
}: {
  target: DraftTarget
  schema: unknown
  initialValue: T
  initialSha: string | null
  title: string | ((value: T) => string)
}) {
  const queryClient = useQueryClient()
  const [creationId, setCreationId] = useState<string>()
  const targetKey = JSON.stringify(target)
  useEffect(() => {
    if (target.path) return
    const search = new URLSearchParams(window.location.search)
    const id = search.get('draft') ?? crypto.randomUUID()
    search.set('draft', id)
    window.history.replaceState(
      window.history.state,
      '',
      `${window.location.pathname}?${search}`,
    )
    setCreationId(id)
  }, [targetKey])
  const { data: auth } = useQuery(authenticationQueryOptions())
  const { data: workspace } = useQuery(repositoryWorkspaceQueryOptions(target))
  const key =
    auth?.user && workspace && (target.path || creationId)
      ? JSON.stringify([
          auth.user.id,
          workspace.source,
          target.owner.toLowerCase(),
          target.repo.toLowerCase(),
          target.branch,
          target.name,
          target.path ?? null,
          target.parent ?? null,
          ...(target.path ? [] : [creationId]),
          ...(target.kind ? [target.kind] : []),
        ])
      : undefined
  const schemaKey = JSON.stringify(schema)
  const fallback = useMemo<DraftState<T>>(
    () => ({
      value: initialValue,
      baseline: initialValue,
      baseSha: initialSha,
      base: { value: initialValue },
      ready: false,
      dirty: false,
      pending: 0,
      error: null,
      status: 'Loading local draft…',
      savedAt: null,
    }),
    [initialValue, initialSha],
  )
  const session = useMemo(() => {
    if (!key || !auth?.user || !workspace || typeof window === 'undefined')
      return
    let entries = sessions.get(queryClient)
    if (!entries) {
      entries = new Map()
      sessions.set(queryClient, entries)
    }
    const registryKey = JSON.stringify([key, schemaKey])
    const existing = entries.get(registryKey)
    if (existing) return existing as DraftSession<T>
    const summary = {
      key,
      account: auth.user.id,
      source: workspace.source,
      target,
      title: typeof title === 'function' ? title(initialValue) : title,
      href: window.location.pathname + window.location.search,
      updatedAt: Date.now(),
    }
    const created = new DraftSession(
      key,
      schemaKey,
      summary,
      initialValue,
      initialSha,
      (value) => (typeof title === 'function' ? title(value) : title),
      () => {
        if (entries.get(registryKey) === (created as DraftSession<unknown>))
          entries.delete(registryKey)
      },
    )
    entries.set(registryKey, created as DraftSession<unknown>)
    return created
  }, [queryClient, key, schemaKey])
  const state = useSyncExternalStore(
    session?.subscribe ?? noopSubscribe,
    session?.getSnapshot ?? (() => fallback),
    () => fallback,
  )
  useEffect(() => session?.mount(), [session])
  useBlocker({
    disabled: !session || (!state.dirty && !state.pending),
    enableBeforeUnload: false,
    shouldBlockFn: async () => {
      if (!session) return false
      try {
        await session.flush()
        return false
      } catch {
        return true
      }
    },
  })
  return {
    ...state,
    session,
    setValue: session?.setValue ?? (() => {}),
    saved: (value: T) => session?.saved(value) ?? Promise.resolve(),
    flush: () => session?.flush() ?? Promise.resolve(),
    discard: () => session?.discard() ?? Promise.resolve(),
    download: session?.download ?? (() => {}),
  }
}
