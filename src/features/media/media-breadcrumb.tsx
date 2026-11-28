import { useDroppable } from '@dnd-kit/core'
import type { ReactNode } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import House from '@hugeicons/core-free-icons/House01Icon'
import { RepositoryBreadcrumb } from '#/components/repository-breadcrumb'

function FolderDropTarget({
  path,
  children,
}: {
  path: string
  children: ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `breadcrumb:${path}`,
    data: { destination: path },
  })
  return (
    <span
      ref={setNodeRef}
      data-drop-active={isOver || undefined}
      className="block truncate rounded-sm px-0.5 data-[drop-active]:bg-accent data-[drop-active]:ring-2 data-[drop-active]:ring-inset data-[drop-active]:ring-primary"
    >
      {children}
    </span>
  )
}

export function MediaBreadcrumb({
  label,
  rootPath,
  path,
  onNavigate,
  allowDrop = false,
  compact = false,
  title = false,
}: {
  label: string
  rootPath: string
  path: string
  onNavigate: (path: string) => void
  allowDrop?: boolean
  compact?: boolean
  title?: boolean
}) {
  const folders = path.slice(rootPath.length).split('/').filter(Boolean)
  const rootIcon = compact ? (
    <HugeiconsIcon aria-hidden="true" icon={House} className="size-3.5" />
  ) : undefined
  const segments = [
    { label, path: rootPath },
    ...folders.map((name, index) => ({
      label: name,
      path: [rootPath, ...folders.slice(0, index + 1)]
        .filter(Boolean)
        .join('/'),
    })),
  ]
  return (
    <RepositoryBreadcrumb
      title={title}
      keepParent={allowDrop}
      items={segments.map((segment, index) => ({
        label: segment.label,
        icon: index === 0 ? rootIcon : undefined,
        link: (
          <button
            type="button"
            aria-label={segment.label}
            onClick={() => onNavigate(segment.path)}
          >
            {allowDrop ? (
              <FolderDropTarget path={segment.path}>
                {index === 0 && rootIcon ? rootIcon : segment.label}
              </FolderDropTarget>
            ) : index === 0 && rootIcon ? (
              rootIcon
            ) : (
              segment.label
            )}
          </button>
        ),
      }))}
    />
  )
}
