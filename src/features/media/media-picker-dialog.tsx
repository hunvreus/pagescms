import { useEffect, useState } from 'react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { Button } from '#/components/ui/button'

import { MediaBrowser } from './media-browser'

import type { MediaCoordinates } from './media-browser'

export function MediaPickerDialog({
  coordinates,
  description = 'Select existing media or upload new files.',
  extensions,
  initialPath,
  open,
  selected = [],
  selectionLimit = 1,
  title,
  onOpenChange,
  onSelect,
  onSelectMany,
}: {
  coordinates: MediaCoordinates
  description?: string
  extensions?: string[]
  initialPath: string
  open: boolean
  selected?: string[]
  selectionLimit?: number
  title: string
  onOpenChange: (open: boolean) => void
  onSelect: (path: string) => void
  onSelectMany?: (paths: string[]) => void
}) {
  const [path, setPath] = useState(initialPath)
  const [draftSelected, setDraftSelected] = useState<string[]>([])
  const selectedKey = selected.join('\0')

  useEffect(() => {
    if (!open) return
    setPath(initialPath)
    setDraftSelected(selectedKey ? selectedKey.split('\0') : [])
  }, [initialPath, open, selectedKey])

  function toggleSelection(selectedPath: string) {
    setDraftSelected((current) => {
      if (current.includes(selectedPath))
        return current.filter((value) => value !== selectedPath)
      return [...current, selectedPath].slice(-selectionLimit)
    })
  }

  function includeUploaded(paths: string[]) {
    setDraftSelected((current) =>
      [...new Set([...current, ...paths])].slice(-selectionLimit),
    )
  }

  function submit() {
    if (!draftSelected.length) return
    if (onSelectMany) onSelectMany(draftSelected)
    else if (draftSelected[0]) onSelect(draftSelected[0])
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden sm:h-[calc(100dvh-6rem)] sm:w-[calc(100vw-6rem)] sm:max-w-screen-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">
            {description}
          </DialogDescription>
        </DialogHeader>
        <MediaBrowser
          className="min-h-0"
          coordinates={coordinates}
          extensions={extensions}
          path={path}
          selected={draftSelected}
          selectionLimit={selectionLimit}
          variant="embedded"
          onPathChange={setPath}
          onSelect={toggleSelection}
          onSelectMany={includeUploaded}
        />
        <DialogFooter className="items-center">
          <span
            aria-live="polite"
            className="mr-auto text-sm text-muted-foreground"
          >
            {draftSelected.length
              ? `${draftSelected.length} selected`
              : 'No media selected'}
          </span>
          <Button disabled={!draftSelected.length} onClick={submit}>
            Select
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
