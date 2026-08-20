import { ImageOff } from 'lucide-react'

import { mediaAssetUrl } from '#/lib/media-assets'

export function MediaThumbnail({
  owner,
  repo,
  branch,
  name,
  path,
  className = 'size-12',
}: {
  owner: string
  repo: string
  branch: string
  name: string
  path: string
  className?: string
}) {
  return (
    <span
      className={`${className} relative shrink-0 overflow-hidden rounded-md border bg-muted`}
    >
      <ImageOff className="absolute inset-0 m-auto size-4 text-muted-foreground" />
      <img
        alt=""
        className="absolute inset-0 size-full object-cover"
        loading="lazy"
        src={mediaAssetUrl({ owner, repo, branch, name, path })}
      />
    </span>
  )
}
