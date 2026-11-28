import { HugeiconsIcon } from '@hugeicons/react'
import File from '@hugeicons/core-free-icons/File02Icon'
import FileArchive from '@hugeicons/core-free-icons/FileArchiveIcon'
import FileAudio from '@hugeicons/core-free-icons/FileAudioIcon'
import FileCode from '@hugeicons/core-free-icons/FileCodeIcon'
import FileImage from '@hugeicons/core-free-icons/FileImageIcon'
import FileSpreadsheet from '@hugeicons/core-free-icons/FileSpreadsheetIcon'
import FileText from '@hugeicons/core-free-icons/FileTextIcon'
import FileType from '@hugeicons/core-free-icons/FileTypeIcon'
import FileVideo from '@hugeicons/core-free-icons/FileVideoIcon'
import { getFileCategory } from '#/lib/file-types'
import type { HugeiconsProps as IconProps } from '@hugeicons/react'

const icons = {
  image: FileImage,
  document: FileText,
  video: FileVideo,
  audio: FileAudio,
  compressed: FileArchive,
  code: FileCode,
  font: FileType,
  spreadsheet: FileSpreadsheet,
}

export function MediaFileIcon({
  path,
  className = 'size-4 shrink-0',
  ...props
}: { path: string } & IconProps) {
  const category = getFileCategory(path)
  const Icon = category ? icons[category] : File
  return (
    <HugeiconsIcon
      aria-hidden="true"
      icon={Icon}
      className={className}
      {...props}
    />
  )
}
