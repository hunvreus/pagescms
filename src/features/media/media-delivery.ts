import { QueryObserver } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { getMediaDelivery } from '#/client/api/media'
import { queryKeys, queryTimes } from '#/client/queries/keys'
import type { MediaVariant } from '#/lib/media-variants'
import type { MediaDeliveryLease } from '#/server/media/provider'

export interface MediaImageInput {
  owner: string
  repo: string
  repoId?: string
  source?: string
  branch: string
  name: string
  path: string
  variant?: MediaVariant
  revision?: string | null
}
export interface MediaImageState {
  source: string | null
  loaded: boolean
  loading: boolean
  failed: boolean
}
type Pending = {
  input: MediaImageInput
  resolve: (lease: MediaDeliveryLease) => void
  reject: (error: unknown) => void
}
type Batch = { pending: Pending[]; forceRefresh: boolean; generation: object }
const clients = new WeakMap<
  QueryClient,
  { groups: Map<string, Batch>; generation: object; forced: Set<string> }
>()

function clientState(client: QueryClient) {
  let state = clients.get(client)
  if (!state) {
    state = { groups: new Map(), generation: {}, forced: new Set() }
    clients.set(client, state)
    // A cleared session cache must not be repopulated by a late response.
    client.getQueryCache().subscribe((event) => {
      if (
        event.type === 'removed' &&
        client.getQueryCache().getAll().length === 0
      ) {
        state!.generation = {}
        state!.forced.clear()
      }
    })
  }
  return state
}

function queuedLease(
  client: QueryClient,
  input: MediaImageInput,
  forceRefresh: boolean,
) {
  const state = clientState(client)
  const parent = input.path.split('/').slice(0, -1).join('/')
  const key = JSON.stringify([
    queryKeys.branch(input),
    input.name,
    parent,
    input.variant ?? 'original',
    forceRefresh,
  ])
  return new Promise<MediaDeliveryLease>((resolve, reject) => {
    const existing = state.groups.get(key)
    if (existing && existing.generation === state.generation) {
      existing.pending.push({ input, resolve, reject })
      return
    }
    const batch: Batch = {
      pending: [{ input, resolve, reject }],
      forceRefresh,
      generation: state.generation,
    }
    state.groups.set(key, batch)
    setTimeout(() => {
      if (state.groups.get(key) === batch) state.groups.delete(key)
      void (async () => {
        try {
          if (batch.generation !== state.generation)
            throw new Error('Media session changed')
          const paths = [
            ...new Set(batch.pending.map((item) => item.input.path)),
          ]
          const leases = new Map<string, MediaDeliveryLease>()
          for (let index = 0; index < paths.length; index += 1000) {
            const result = await getMediaDelivery({
              ...input,
              path: parent,
              paths: paths.slice(index, index + 1000),
              variant: input.variant ?? 'original',
              forceRefresh,
            })
            for (const lease of result.leases) leases.set(lease.path, lease)
          }
          if (batch.generation !== state.generation)
            throw new Error('Media session changed')
          for (const item of batch.pending) {
            const lease = leases.get(item.input.path)
            if (lease) item.resolve(lease)
            else item.reject(new Error('Media delivery is unavailable'))
          }
        } catch (error) {
          for (const item of batch.pending) item.reject(error)
        }
      })()
    }, 10)
  })
}

export function mediaAssetQueryOptions(
  client: QueryClient,
  input: MediaImageInput,
) {
  const parent = input.path.split('/').slice(0, -1).join('/')
  const queryKey = [
    ...queryKeys.mediaDelivery(input),
    parent,
    input.variant ?? 'original',
    input.path,
    input.revision ?? '',
  ] as const
  return {
    queryKey,
    queryFn: () => {
      const cached = client.getQueryData<MediaDeliveryLease>(queryKey)
      const forced = clientState(client).forced.delete(JSON.stringify(queryKey))
      return queuedLease(
        client,
        input,
        forced ||
          Boolean(
            cached?.expiresAt &&
            Date.parse(cached.expiresAt) <= Date.now() + 30_000,
          ),
      )
    },
    staleTime: Infinity,
    gcTime: queryTimes.gc,
    retry: false as const,
    refetchOnWindowFocus: false as const,
    refetchOnReconnect: false as const,
  }
}

const visibility = new Map<Element, (visible: boolean) => void>()
let observer: IntersectionObserver | undefined
export function observeMediaVisibility(
  element: Element,
  callback: (visible: boolean) => void,
) {
  if (typeof IntersectionObserver === 'undefined') {
    callback(true)
    return () => {}
  }
  observer ??= new IntersectionObserver(
    (entries) => {
      for (const entry of entries)
        visibility.get(entry.target)?.(entry.isIntersecting)
    },
    { rootMargin: '256px' },
  )
  visibility.set(element, callback)
  observer.observe(element)
  return () => {
    visibility.delete(element)
    observer?.unobserve(element)
    if (!visibility.size) {
      observer?.disconnect()
      observer = undefined
    }
  }
}

/** Changes only the editing/display DOM. Never put expiring URLs in saved content. */
export function bindMediaImage(
  client: QueryClient,
  input: MediaImageInput,
  image: HTMLImageElement,
  changed: (state: MediaImageState) => void = () => {},
  initialLease?: MediaDeliveryLease,
) {
  let active = true
  let visible = false
  let loaded = image.complete && image.naturalWidth > 0
  let failed = false
  let invalidated = false
  let attempts = 0
  let identity: string | undefined
  let lease: MediaDeliveryLease | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  const options = mediaAssetQueryOptions(client, input)
  if (
    initialLease &&
    (!initialLease.expiresAt ||
      Date.parse(initialLease.expiresAt) > Date.now() + 30_000) &&
    !client.getQueryData(options.queryKey)
  )
    client.setQueryData(options.queryKey, initialLease)
  const query = new QueryObserver(client, { ...options, enabled: false })
  const emit = (loading = false) => {
    if (active)
      changed({ source: image.getAttribute('src'), loaded, failed, loading })
  }
  const expired = () =>
    !lease ||
    Boolean(
      lease.expiresAt && Date.parse(lease.expiresAt) <= Date.now() + 30_000,
    )
  const refresh = (force = false) => {
    if (!active || !visible || document.visibilityState === 'hidden') return
    if (!query.getCurrentResult().isFetching) {
      if (force)
        clientState(client).forced.add(JSON.stringify(options.queryKey))
      emit(true)
      void query.refetch({ cancelRefetch: false })
    }
  }
  const schedule = () => {
    clearTimeout(timer)
    if (visible && !loaded && lease?.expiresAt)
      timer = setTimeout(
        () => refresh(),
        Math.max(5000, Date.parse(lease.expiresAt) - Date.now() - 30_000),
      )
  }
  const apply = (next: MediaDeliveryLease) => {
    if (!active) return
    lease = next
    if (!visible) return
    const nextIdentity = JSON.stringify([
      input.owner.toLowerCase(),
      input.repo.toLowerCase(),
      input.path,
      next.cacheKey ?? input.revision,
      input.variant ?? 'original',
    ])
    if (
      !loaded ||
      identity !== nextIdentity ||
      (next.cacheKey === null && !input.revision && invalidated)
    ) {
      if (
        (next.cacheKey === null && !input.revision && invalidated) ||
        image.getAttribute('src') !== next.url ||
        identity !== nextIdentity ||
        failed
      ) {
        loaded = false
        failed = false
        image.src = next.url
      }
    }
    identity = nextIdentity
    invalidated = false
    schedule()
    emit()
  }
  const unsubscribe = query.subscribe((result) => {
    if (result.isStale) invalidated = true
    if (result.data && !result.isFetching && !result.isError && !result.isStale)
      apply(result.data)
    if (result.isError) {
      failed = !loaded
      emit(result.isFetching)
    }
  })
  const onLoad = () => {
    loaded = true
    failed = false
    attempts = 0
    clearTimeout(timer)
    clearTimeout(retryTimer)
    emit()
  }
  const onError = () => {
    loaded = false
    failed = true
    clearTimeout(timer)
    if (attempts++ < 1) {
      emit(true)
      retryTimer = setTimeout(() => {
        if (!visible || document.visibilityState === 'hidden') emit()
        else refresh(true)
      }, 500)
    } else emit()
  }
  const resume = () => {
    if (
      (!loaded && expired()) ||
      client.getQueryState(options.queryKey)?.isInvalidated
    )
      refresh()
  }
  image.referrerPolicy = 'no-referrer'
  image.loading = 'lazy'
  image.addEventListener('load', onLoad)
  image.addEventListener('error', onError)
  const stopVisibility = observeMediaVisibility(image, (value) => {
    if (value) {
      query.setOptions({ ...options, enabled: true })
      visible = true
      const cached = query.getCurrentResult().data
      if (cached) lease = cached
      if ((!loaded || !identity) && expired()) refresh()
      else if (
        lease &&
        !query.getCurrentResult().isFetching &&
        !query.getCurrentResult().isStale
      )
        apply(lease)
    } else {
      visible = false
      query.setOptions({ ...options, enabled: false })
      clearTimeout(timer)
    }
  })
  window.addEventListener('focus', resume)
  window.addEventListener('online', resume)
  document.addEventListener('visibilitychange', resume)
  const destroy = () => {
    active = false
    clearTimeout(timer)
    clearTimeout(retryTimer)
    stopVisibility()
    unsubscribe()
    query.destroy()
    image.removeEventListener('load', onLoad)
    image.removeEventListener('error', onError)
    window.removeEventListener('focus', resume)
    window.removeEventListener('online', resume)
    document.removeEventListener('visibilitychange', resume)
  }
  return {
    destroy,
    retry: () => {
      attempts = 0
      clearTimeout(retryTimer)
      refresh(true)
    },
  }
}
