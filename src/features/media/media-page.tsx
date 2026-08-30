import { MediaBrowser } from './media-browser'

import type { MediaCoordinates } from './media-browser'

export function MediaPage({
  coordinates,
  path,
  onPathChange,
}: {
  coordinates: MediaCoordinates
  path?: string
  onPathChange: (path: string) => void
}) {
  return (
    <div className="-m-4 md:-m-6">
      <MediaBrowser
        coordinates={coordinates}
        path={path}
        variant="page"
        onPathChange={onPathChange}
      />
    </div>
  )
}
