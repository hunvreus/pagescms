import { useEffect, useRef, useState } from 'react'
import { Ban, ImageOff, LoaderCircle } from 'lucide-react'

import { mediaAssetUrl } from '#/lib/media-assets'
import { cn } from '#/lib/utils'

export function MediaThumbnail({
  owner,
  repo,
  branch,
  name,
  path,
  source,
  className = 'size-12',
}: {
  owner: string
  repo: string
  branch: string
  name: string
  path?: string | null
  source?: string | null
  className?: string
}) {
  const src = path
    ? source || mediaAssetUrl({ owner, repo, branch, name, path })
    : null
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null)
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const failed = !!src && failedSrc === src
  const loading = !!src && loadedSrc !== src && !failed

  useEffect(() => {
    const image = imageRef.current
    if (!src || !image?.complete) return
    if (image.naturalWidth > 0) setLoadedSrc(src)
    else setFailedSrc(src)
  }, [src])

  return (
    <span
      className={cn(
        'relative block shrink-0 overflow-hidden rounded-md border bg-muted',
        className,
      )}
      data-state={
        !src ? 'empty' : failed ? 'error' : loading ? 'loading' : 'loaded'
      }
    >
      {!src ? (
        <span
          className="absolute inset-0 flex items-center justify-center"
          title="No image"
        >
          <ImageOff className="size-4 text-muted-foreground" />
        </span>
      ) : failed ? (
        <span
          className="absolute inset-0 flex items-center justify-center"
          title="Could not load image"
        >
          <Ban className="size-4 text-muted-foreground" />
        </span>
      ) : loading ? (
        <span
          className="absolute inset-0 flex items-center justify-center"
          title="Loading image"
        >
          <LoaderCircle className="size-4 animate-spin text-muted-foreground" />
        </span>
      ) : null}
      {src ? (
        <img
          alt=""
          className={cn(
            'absolute inset-0 size-full object-cover',
            loadedSrc === src && !failed ? 'opacity-100' : 'opacity-0',
          )}
          loading="lazy"
          referrerPolicy="no-referrer"
          ref={imageRef}
          onError={() => setFailedSrc(src)}
          onLoad={() => setLoadedSrc(src)}
          src={src}
        />
      ) : null}
    </span>
  )
}
