import {
  Trans as UiTrans,
  useLingui as useUiMessages,
} from '@lingui/react/macro'
import { HugeiconsIcon } from '@hugeicons/react'
import { notifyError, toast } from '#/lib/notifications'
import { Spinner } from '#/components/ui/spinner'
import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import FolderOpen from '@hugeicons/core-free-icons/Folder02Icon'
import Upload from '@hugeicons/core-free-icons/Upload01Icon'
import { ContentIcon } from '#/components/content-icon'
import { Button } from '#/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '#/components/ui/tooltip'
import {
  completeMediaUpload,
  patchMedia,
  refreshMedia,
  useMediaMutation,
} from '#/features/media/media-mutations'
import { invalidateActivity } from '#/features/activity/activity-query'
import { accountIsActive } from '#/features/pending-writes/account-operation'
import { authenticationQueryOptions } from '#/client/queries/session'
import type { MediaCoordinates } from '#/features/media/media-browser'

export function OverviewMediaUpload({
  coordinates,
  label,
  icon,
  path,
  extensions,
}: {
  coordinates: MediaCoordinates
  label: string
  icon?: string
  path: string
  extensions: string[]
}) {
  const { t: _t } = useUiMessages()

  const client = useQueryClient()
  const mutation = useMediaMutation<string[]>()
  const input = useRef<HTMLInputElement>(null)
  const mounted = useRef(false)
  const locked = useRef(false)
  const notification = useRef<string | undefined>(undefined)
  // Avoid losing the first file-picker click while the page hydrates.
  const [ready, setReady] = useState(false)
  const [uploading, setUploading] = useState(false)
  useEffect(() => {
    mounted.current = true
    setReady(true)
    return () => {
      mounted.current = false
    }
  }, [])

  async function upload(files: File[]) {
    if (locked.current || !files.length) return
    const account = client.getQueryData(authenticationQueryOptions().queryKey)
      ?.user?.id
    if (!account) {
      notifyError(
        new Error('Sign in before uploading media.'),
        _t({ message: 'Could not upload media.' }),
      )
      return
    }
    const active = accountIsActive(client, account)
    locked.current = true
    setUploading(true)
    let uploaded = 0
    try {
      const id = crypto.randomUUID()
      if (notification.current) toast.dismiss(notification.current)
      notification.current = id
      await mutation.run({
        id,
        coordinates,
        kind: 'upload',
        directory: path,
        paths: [path, ...files.map((file) => `${path}/${file.name}`)],
        files,
        run: async () => {
          const { uploadMediaFiles } =
            await import('#/features/media/media-upload')
          return uploadMediaFiles({
            notificationId: id,
            coordinates,
            extensions: extensions.length ? extensions : undefined,
            files,
            path,
            isActive: active,
            onUploaded: (result, file, index) => {
              if (!active()) return
              uploaded += 1
              patchMedia(client, coordinates, [], {
                id: result.path,
                path: result.path,
                name: result.path.split('/').at(-1)!,
                type: 'file',
                sha: result.version,
                size: file.size,
                contentType: file.type || null,
              })
              completeMediaUpload(client, account, id, index)
            },
          })
        },
      })
    } catch (cause) {
      if (uploaded > 0 && active()) invalidateActivity(client, coordinates)
    } finally {
      if (active()) refreshMedia(client, coordinates, [path])
      locked.current = false
      if (mounted.current) setUploading(false)
    }
  }

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            aria-busy={uploading}
            aria-label={_t({ message: `Upload ${label}` })}
            className="max-w-full"
            disabled={!ready || uploading}
            size="sm"
            variant="outline"
            onClick={() => input.current?.click()}
          >
            <ContentIcon
              name={icon}
              fallback={FolderOpen}
              className="size-4 shrink-0"
              data-icon="inline-start"
            />
            <span className="min-w-0 truncate">{label}</span>
            {uploading ? (
              <Spinner aria-hidden="true" data-icon="inline-end" />
            ) : (
              <HugeiconsIcon
                aria-hidden="true"
                icon={Upload}
                data-icon="inline-end"
                className="text-muted-foreground transition-colors group-hover/button:text-foreground group-focus-visible/button:text-foreground"
              />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <UiTrans>Upload files to </UiTrans>
          {label}
        </TooltipContent>
      </Tooltip>
      <input
        ref={input}
        hidden
        multiple
        type="file"
        accept={extensions.map((value) => `.${value}`).join(',') || undefined}
        onChange={(event) => {
          const files = Array.from(event.target.files ?? [])
          event.target.value = ''
          void upload(files)
        }}
      />
    </>
  )
}
