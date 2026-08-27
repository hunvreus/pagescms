import { useEffect, useState } from 'react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'

import { MediaBrowser } from './media-browser'

import type { MediaCoordinates } from './media-browser'

export function MediaPickerDialog({
  coordinates,
  description = 'Select existing media or upload new files.',
  extensions,
  open,
  rootPath,
  selected,
  selectionLimit,
  title,
  onOpenChange,
  onSelect,
  onSelectMany,
}: {
  coordinates: MediaCoordinates
  description?: string
  extensions?: string[]
  open: boolean
  rootPath: string
  selected?: string[]
  selectionLimit?: number
  title: string
  onOpenChange: (open: boolean) => void
  onSelect: (path: string) => void
  onSelectMany?: (paths: string[]) => void
}) {
  const [path, setPath] = useState(rootPath)

  useEffect(() => {
    if (open) setPath(rootPath)
  }, [open, rootPath])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <MediaBrowser
          coordinates={coordinates}
          extensions={extensions}
          path={path}
          selected={selected}
          selectionLimit={selectionLimit}
          variant="embedded"
          onPathChange={setPath}
          onSelect={onSelect}
          onSelectMany={onSelectMany}
        />
      </DialogContent>
    </Dialog>
  )
}
