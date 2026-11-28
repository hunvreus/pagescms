import { DragOverlay, useDndContext } from '@dnd-kit/core'
import { useLayoutEffect, useRef } from 'react'

function DragPreview({
  source,
  activator,
}: {
  source: HTMLElement
  activator: Event | null
}) {
  const host = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const preview = host.current
    if (!preview) return
    // Copy the rendered thumbnail without mounting another media loader.
    const label = source.querySelector<HTMLElement>('[data-media-drag-label]')
    const copy = (label ?? source).cloneNode(true) as HTMLElement
    copy.removeAttribute('data-media-path')
    for (const node of copy.querySelectorAll('[id]')) node.removeAttribute('id')
    preview.replaceChildren(copy)
    if (label && activator instanceof PointerEvent) {
      const row = source.getBoundingClientRect()
      const original = label.getBoundingClientRect()
      preview.style.width = `${original.width}px`
      // Keep the grabbed thumbnail pixel or letter under the pointer. Empty row space has no corresponding pixel.
      const x = activator.clientX - original.left
      const y = activator.clientY - original.top
      const anchorX = x >= 0 && x < original.width ? x : original.width / 2
      const anchorY = Math.max(0, Math.min(y, original.height))
      preview.style.left = `${activator.clientX - row.left - anchorX}px`
      preview.style.top = `${activator.clientY - row.top - anchorY}px`
    }
    return () => preview.replaceChildren()
  }, [source, activator])
  return (
    <div
      ref={host}
      inert
      aria-hidden="true"
      data-media-drag-overlay
      className={
        source instanceof HTMLTableRowElement
          ? 'pointer-events-none absolute overflow-hidden text-sm opacity-80 [&>button]:max-w-full'
          : 'pointer-events-none size-full overflow-hidden opacity-80'
      }
    />
  )
}

export function MediaDragOverlay() {
  const { activeNode, activatorEvent } = useDndContext()
  return (
    <DragOverlay dropAnimation={null} style={{ pointerEvents: 'none' }}>
      {activeNode && (
        <DragPreview source={activeNode} activator={activatorEvent} />
      )}
    </DragOverlay>
  )
}
