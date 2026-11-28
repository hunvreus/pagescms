import { useLingui as useUiMessages } from '@lingui/react/macro'
import { HugeiconsIcon } from '@hugeicons/react'
import { useContext, useEffect, useRef, useState } from 'react'
import { QueryClientContext } from '@tanstack/react-query'
import { bindMediaImage } from '#/features/media/media-delivery'
import type { MediaImageState } from '#/features/media/media-delivery'
import type { MediaVariant } from '#/lib/media-variants'
import type { MediaDeliveryLease } from '#/server/media/provider'
import Ban from '@hugeicons/core-free-icons/BanIcon'
import ImageOff from '@hugeicons/core-free-icons/ImageOffIcon'
import LoaderIcon from '@hugeicons/core-free-icons/LoaderIcon'

import { cn } from 'cn'

export function MediaThumbnail({
  owner,
  repo,
  repoId,
  repositorySource,
  branch,
  name,
  path,
  source: providedSource,
  revision,
  variant = 'thumbnail',
  loadingSource = false,
  initialLease,
  onSourceError,
  className = 'size-12',
}: {
  owner: string
  repo: string
  repoId?: string
  repositorySource?: string
  branch: string
  name: string
  path?: string | null
  source?: string | null
  revision?: string | null
  variant?: MediaVariant
  loadingSource?: boolean
  initialLease?: MediaDeliveryLease
  onSourceError?: (source: string) => void
  className?: string
}) {
  const { t: _t } = useUiMessages()

  const source =
    providedSource ?? (path && /^https?:\/\//i.test(path) ? path : undefined)
  const retryRef = useRef<(() => void) | null>(null)
  const client = useContext(QueryClientContext)
  const imageRef = useRef<HTMLImageElement>(null)
  const [state, setState] = useState<MediaImageState>({
    source: source ?? null,
    loaded: false,
    loading: Boolean(path),
    failed: false,
  })
  useEffect(() => {
    const image = imageRef.current
    if (!image || !path) return
    if (source) {
      // Explicit sources are useful for external providers and drag overlays.
      image.src = source
      retryRef.current = () => {
        setState({ source, loaded: false, loading: true, failed: false })
        image.src = source
      }
      return () => {
        retryRef.current = null
      }
    }
    if (!client) return
    const binding = bindMediaImage(
      client,
      {
        owner,
        repo,
        repoId,
        source: repositorySource,
        branch,
        name,
        path,
        revision,
        variant,
      },
      image,
      setState,
      initialLease,
    )
    retryRef.current = binding.retry
    return () => {
      binding.destroy()
      retryRef.current = null
    }
  }, [
    client,
    owner,
    repo,
    repoId,
    repositorySource,
    branch,
    name,
    path,
    revision,
    variant,
    source,
    initialLease,
  ])
  const loading =
    Boolean(path) && !state.loaded && (!state.failed || state.loading)
  const failed = state.failed
  const presentation = !path
    ? 'empty'
    : state.loaded
      ? 'loaded'
      : state.failed && !state.loading
        ? 'error'
        : 'loading'

  return (
    <span
      className={cn(
        'relative block shrink-0 overflow-hidden rounded-md border bg-muted',
        className,
      )}
      data-state={presentation}
    >
      {!path && !loadingSource ? (
        <span
          className="absolute inset-0 flex items-center justify-center"
          title={_t({ message: 'No image' })}
        >
          <HugeiconsIcon
            aria-hidden="true"
            icon={ImageOff}
            className="size-4 text-muted-foreground"
          />
        </span>
      ) : loading ? (
        <span
          className="absolute inset-0 flex items-center justify-center"
          title={_t({ message: 'Loading image' })}
        >
          <HugeiconsIcon
            aria-hidden="true"
            icon={LoaderIcon}
            className="size-4 animate-spin text-muted-foreground"
          />
        </span>
      ) : failed && !state.loaded ? (
        <span
          className="absolute inset-0 flex items-center justify-center"
          title={_t({ message: 'Could not load image' })}
        >
          <button
            type="button"
            aria-label={_t({ message: 'Retry image' })}
            className="cursor-pointer"
            onClick={(event) => {
              event.stopPropagation()
              retryRef.current?.()
            }}
          >
            <HugeiconsIcon
              aria-hidden="true"
              icon={Ban}
              className="size-4 text-muted-foreground"
            />
          </button>
        </span>
      ) : null}
      {path ? (
        <img
          alt=""
          draggable={false}
          className={cn(
            'absolute inset-0 size-full object-cover',
            state.loaded ? 'opacity-100' : 'opacity-0',
          )}
          loading="lazy"
          referrerPolicy="no-referrer"
          ref={imageRef}
          onError={() => {
            if (source) {
              setState({ source, loaded: false, loading: false, failed: true })
              onSourceError?.(source)
            }
          }}
          onLoad={() => {
            if (source)
              setState({ source, loaded: true, loading: false, failed: false })
          }}
          src={source ?? undefined}
        />
      ) : null}
    </span>
  )
}
