import {
  Trans as UiTrans,
  useLingui as useUiMessages,
} from '@lingui/react/macro'
import { HugeiconsIcon } from '@hugeicons/react'
import { Spinner } from '#/components/ui/spinner'
import { useEffect, useRef, useState } from 'react'
import ImageUp from '@hugeicons/core-free-icons/ImageUpIcon'
import Trash2 from '@hugeicons/core-free-icons/Delete02Icon'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '#/components/ui/alert-dialog'
import { Avatar, AvatarImage } from '#/components/ui/avatar'
import { GradientAvatarFallback } from '#/components/gradient-avatar-fallback'
import { Button } from '#/components/ui/button'
import { FieldError } from '#/components/ui/field'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '#/components/ui/tooltip'
import { PROFILE_IMAGE_MAX_BYTES } from '#/lib/profile'

async function readProfilePicture(file: File) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type))
    throw new Error('Choose a PNG, JPEG or WebP picture.')
  if (file.size > 5 * 1024 * 1024)
    throw new Error('Choose a picture smaller than 5 MB.')
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error('This picture could not be read. Try another image.')
  }
  try {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 256
    const context = canvas.getContext('2d')
    if (!context)
      throw new Error('This browser could not prepare your picture.')
    const side = Math.min(bitmap.width, bitmap.height)
    context.drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      256,
      256,
    )
    const image = canvas.toDataURL('image/webp', 0.85)
    if (atob(image.split(',')[1]).length > PROFILE_IMAGE_MAX_BYTES)
      throw new Error('This picture is too large. Try another image.')
    return image
  } finally {
    bitmap.close()
  }
}

export function ProfilePicture({
  email,
  name,
  image,
  disabled,
  processing,
  invalid = false,
  errorDescription,
  confirmRemoval = false,
  onChange,
  onProcessingChange,
  onError,
}: {
  email: string
  name: string
  image: string | null
  disabled: boolean
  processing: boolean
  invalid?: boolean
  errorDescription?: string
  confirmRemoval?: boolean
  onChange: (image: string | null) => void
  onProcessingChange: (processing: boolean) => void
  onError?: (error?: string) => void
}) {
  const { t: _t } = useUiMessages()

  const input = useRef<HTMLInputElement>(null)
  const uploading = useRef(false)
  const [error, setError] = useState<string>()
  const [ready, setReady] = useState(false)
  const [dragging, setDragging] = useState(false)
  const locked = disabled || processing || !ready
  useEffect(() => setReady(true), [])
  function reportError(message?: string) {
    setError(message)
    onError?.(message)
  }
  const remove = (
    <Button
      type="button"
      aria-label={_t({ message: 'Remove picture' })}
      className="text-muted-foreground hover:text-foreground"
      size="icon-sm"
      variant="ghost"
      disabled={locked}
      onClick={() => {
        reportError(undefined)
        if (!confirmRemoval) onChange(null)
      }}
    >
      <HugeiconsIcon aria-hidden="true" icon={Trash2} />
    </Button>
  )
  async function upload(file: File) {
    if (locked || uploading.current) return
    uploading.current = true
    reportError(undefined)
    onProcessingChange(true)
    try {
      onChange(await readProfilePicture(file))
    } catch (cause) {
      reportError(
        cause instanceof Error
          ? cause.message
          : 'This picture could not be read.',
      )
    } finally {
      uploading.current = false
      onProcessingChange(false)
    }
  }
  return (
    <AlertDialog>
      <TooltipProvider>
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  aria-label={_t({ message: 'Upload profile picture' })}
                  aria-busy={processing}
                  aria-invalid={invalid || Boolean(error)}
                  aria-errormessage={errorDescription}
                  aria-describedby={errorDescription}
                  className="group/picture relative size-9 rounded-full border-0 p-0 hover:bg-transparent"
                  size="icon"
                  variant="ghost"
                  disabled={locked}
                  data-active={dragging || processing}
                  onClick={() => input.current?.click()}
                  onDragOver={(event) => {
                    if (!event.dataTransfer.types.includes('Files')) return
                    event.preventDefault()
                    event.dataTransfer.dropEffect = locked ? 'none' : 'copy'
                    if (!locked) setDragging(true)
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(event) => {
                    if (!event.dataTransfer.types.includes('Files')) return
                    event.preventDefault()
                    setDragging(false)
                    if (locked) return
                    const files = event.dataTransfer.files
                    if (files.length !== 1) {
                      reportError('Choose one picture at a time.')
                      return
                    }
                    void upload(files[0])
                  }}
                >
                  <Avatar className="pointer-events-none size-9">
                    <AvatarImage
                      alt={name || email}
                      src={image ?? undefined}
                      draggable={false}
                    />
                    <GradientAvatarFallback
                      identity={email}
                      initials={(name || email).slice(0, 2).toUpperCase()}
                    />
                  </Avatar>
                  <span
                    data-slot="profile-picture-overlay"
                    className="pointer-events-none absolute inset-0 grid place-items-center rounded-full bg-background/60 text-foreground opacity-0 transition-opacity group-hover/picture:opacity-100 group-focus-visible/picture:opacity-100 group-data-[active=true]/picture:opacity-100"
                  >
                    {processing ? (
                      <Spinner aria-hidden="true" className="opacity-60" />
                    ) : (
                      <HugeiconsIcon
                        aria-hidden="true"
                        icon={ImageUp}
                        className="size-4 opacity-50"
                      />
                    )}
                  </span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <UiTrans>Upload or drop a picture</UiTrans>
              </TooltipContent>
            </Tooltip>
            <input
              id="profile-picture"
              ref={input}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              aria-label={_t({ message: 'Upload profile picture' })}
              className="hidden"
              disabled={locked}
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ''
                if (file) void upload(file)
              }}
            />
            {image ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  {confirmRemoval ? (
                    <AlertDialogTrigger asChild>{remove}</AlertDialogTrigger>
                  ) : (
                    remove
                  )}
                </TooltipTrigger>
                <TooltipContent>
                  <UiTrans>Remove picture</UiTrans>
                </TooltipContent>
              </Tooltip>
            ) : null}
          </div>
          {onError ? null : <FieldError>{error}</FieldError>}
        </div>
      </TooltipProvider>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            <UiTrans>Remove picture?</UiTrans>
          </AlertDialogTitle>
          <AlertDialogDescription>
            <UiTrans>
              Your picture will be replaced with your default avatar.
            </UiTrans>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>
            <UiTrans>Cancel</UiTrans>
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={locked}
            onClick={() => onChange(null)}
          >
            <UiTrans>Remove picture</UiTrans>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
