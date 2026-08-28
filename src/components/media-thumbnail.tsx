import { useEffect, useRef, useState } from 'react'
import { Ban, ImageOff, LoaderCircle } from 'lucide-react'

import { mediaAssetUrl } from '#/lib/media-assets'
import { cn } from '#/lib/utils'

export function mediaThumbnailPresentation({
  source,
  loadingSource,
  displayedSource,
  loadedSource,
  failedSource,
}: {
  source: string | null
  loadingSource: boolean
  displayedSource: string | null
  loadedSource: string | null
  failedSource: string | null
}) {
  const failed = !!source && failedSource === source
  const hasUsableDisplayedImage =
    !!displayedSource &&
    loadedSource === displayedSource &&
    failedSource !== displayedSource
  const loading =
    (loadingSource && !hasUsableDisplayedImage) ||
    (!!source &&
      displayedSource === source &&
      loadedSource !== source &&
      !failed) ||
    (!!source &&
      displayedSource !== source &&
      !hasUsableDisplayedImage &&
      !failed)
  return {
    failed,
    hasUsableDisplayedImage,
    loading,
    state:
      !source && !loadingSource
        ? ('empty' as const)
        : loading
          ? ('loading' as const)
          : failed && !hasUsableDisplayedImage
            ? ('error' as const)
            : ('loaded' as const),
  }
}

export function MediaThumbnail({
  owner,
  repo,
  branch,
  name,
  path,
  source,
  allowProxy = true,
  loadingSource = false,
  onSourceError,
  className = 'size-12',
}: {
  owner: string
  repo: string
  branch: string
  name: string
  path?: string | null
  source?: string | null
  allowProxy?: boolean
  loadingSource?: boolean
  onSourceError?: (source: string) => void
  className?: string
}) {
  const src = path
    ? (source ??
      (allowProxy ? mediaAssetUrl({ owner, repo, branch, name, path }) : null))
    : null
  const [displayedSrc, setDisplayedSrc] = useState<string | null>(src)
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null)
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const { failed, hasUsableDisplayedImage, loading, state } =
    mediaThumbnailPresentation({
      source: src,
      loadingSource,
      displayedSource: displayedSrc,
      loadedSource: loadedSrc,
      failedSource: failedSrc,
    })

  useEffect(() => {
    if (!src || src === displayedSrc) return
    const candidate = new Image()
    candidate.referrerPolicy = 'no-referrer'
    candidate.onload = () => {
      setDisplayedSrc(src)
      setLoadedSrc(src)
    }
    candidate.onerror = () => {
      setFailedSrc(src)
      onSourceError?.(src)
    }
    candidate.src = src
    return () => {
      candidate.onload = null
      candidate.onerror = null
    }
  }, [displayedSrc, onSourceError, src])

  useEffect(() => {
    const image = imageRef.current
    if (!displayedSrc || !image?.complete) return
    if (image.naturalWidth > 0) setLoadedSrc(displayedSrc)
    else {
      setFailedSrc(displayedSrc)
      onSourceError?.(displayedSrc)
    }
  }, [displayedSrc, onSourceError])

  return (
    <span
      className={cn(
        'relative block shrink-0 overflow-hidden rounded-md border bg-muted',
        className,
      )}
      data-state={state}
    >
      {!src && !loadingSource ? (
        <span
          className="absolute inset-0 flex items-center justify-center"
          title="No image"
        >
          <ImageOff className="size-4 text-muted-foreground" />
        </span>
      ) : loading ? (
        <span
          className="absolute inset-0 flex items-center justify-center"
          title="Loading image"
        >
          <LoaderCircle className="size-4 animate-spin text-muted-foreground" />
        </span>
      ) : failed && !hasUsableDisplayedImage ? (
        <span
          className="absolute inset-0 flex items-center justify-center"
          title="Could not load image"
        >
          <Ban className="size-4 text-muted-foreground" />
        </span>
      ) : null}
      {displayedSrc ? (
        <img
          alt=""
          className={cn(
            'absolute inset-0 size-full object-cover',
            loadedSrc === displayedSrc && failedSrc !== displayedSrc
              ? 'opacity-100'
              : 'opacity-0',
          )}
          loading="lazy"
          referrerPolicy="no-referrer"
          ref={imageRef}
          onError={() => {
            setFailedSrc(displayedSrc)
            onSourceError?.(displayedSrc)
          }}
          onLoad={() => setLoadedSrc(displayedSrc)}
          src={displayedSrc}
        />
      ) : null}
    </span>
  )
}
