import { Trans } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { mediaQueryOptions } from '#/client/queries/content'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { Spinner } from '#/components/ui/spinner'
import { MediaFolderTree } from './media-folder-tree'
import { mediaParent } from './media-mutations'
import type { MediaCoordinates } from './media-browser'
import type { MediaEntry } from './media-model'

export function MediaMoveDialog({
  coordinates,
  entry,
  label,
  rootPath,
  moving,
  onClose,
  onCloseAutoFocus,
  onMove,
}: {
  coordinates: MediaCoordinates
  entry: MediaEntry
  label: string
  rootPath: string
  moving: boolean
  onClose: () => void
  onCloseAutoFocus: (event: Event) => void
  onMove: (destination: string) => void
}) {
  const source = mediaParent(entry.path)
  const [path, setPath] = useState<string | null>(source)
  const query = useQuery({
    ...mediaQueryOptions({
      ...coordinates,
      path: path === rootPath || path === null ? undefined : path,
    }),
    enabled: path !== null,
  })
  const filename = entry.name

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent onCloseAutoFocus={onCloseAutoFocus}>
        <DialogHeader>
          <DialogTitle>
            <Trans>Move {filename}</Trans>
          </DialogTitle>
          <DialogDescription>
            <Trans>Choose a folder for this file.</Trans>
          </DialogDescription>
        </DialogHeader>
        <div inert={moving}>
          <MediaFolderTree
            coordinates={coordinates}
            rootPath={rootPath}
            label={label}
            selected={path}
            onSelect={setPath}
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            <Trans>Cancel</Trans>
          </Button>
          <Button
            disabled={
              moving ||
              path === null ||
              path === source ||
              !query.isSuccess ||
              !query.data.media.capabilities.move
            }
            aria-busy={moving}
            onClick={() => path !== null && onMove(path)}
          >
            <Trans>Move</Trans>
            {moving && <Spinner aria-hidden="true" data-icon="inline-end" />}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
