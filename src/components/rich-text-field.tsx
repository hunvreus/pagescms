import { useEffect, useRef, useState } from 'react'

import { Textarea } from '#/components/ui/textarea'
import { Editor } from '#/components/ui/editor'
import {
  richTextValueForEditor,
  richTextValueForStorage,
} from '#/features/editor/rich-text-media'
import { MediaPickerDialog } from '#/features/media/media-picker-dialog'
import { uploadMediaFiles } from '#/features/media/media-upload'
import { mediaAssetUrl } from '#/lib/media-assets'
import {
  allowedMediaFieldExtensions,
  resolveFieldMedia,
} from '#/lib/media-field-values'

import type { ReferenceContext } from '#/components/structured-content-field'
import type {
  ImagePickerResult,
  ImageUploadResult,
} from '#/components/ui/editor'
import type { JsonObject, JsonValue } from '#/lib/json'

function fieldOptions(field: JsonObject) {
  return typeof field.options === 'object' &&
    field.options !== null &&
    !Array.isArray(field.options)
    ? field.options
    : {}
}

export default function RichTextField({
  field,
  id,
  label,
  value,
  disabled,
  mode,
  referenceContext,
  onChange,
  onPendingUploadsChange,
}: {
  field: JsonObject
  id: string
  label: string
  value: JsonValue | undefined
  disabled: boolean
  mode: 'editor' | 'source'
  referenceContext?: ReferenceContext
  onChange: (value: JsonValue | undefined) => void
  onPendingUploadsChange: (count: number) => void
}) {
  const options = fieldOptions(field)
  const format = options.format === 'html' ? 'html' : 'markdown'
  const source = typeof value === 'string' ? value : ''
  const media = resolveFieldMedia(field, referenceContext?.media ?? [])
  const mediaContext =
    media && referenceContext
      ? { ...referenceContext, name: media.name }
      : undefined
  const pickerPath = media
    ? typeof options.path === 'string' &&
      (!media.input ||
        options.path === media.input ||
        options.path.startsWith(`${media.input}/`))
      ? options.path
      : media.input
    : ''
  const pickerExtensions = media
    ? allowedMediaFieldExtensions({ ...field, type: 'image' }, media)
    : undefined
  const [pickerOpen, setPickerOpen] = useState(false)
  const pickerResolver = useRef<
    ((result: ImagePickerResult | null) => void) | null
  >(null)

  useEffect(
    () => () => {
      pickerResolver.current?.(null)
    },
    [],
  )

  const editorValue = richTextValueForEditor(source, media, mediaContext)

  async function uploadImage(file: File): Promise<ImageUploadResult | null> {
    if (!media || !mediaContext || !referenceContext) return null
    const extensions = allowedMediaFieldExtensions(
      { ...field, type: 'image' },
      media,
    )
    const configuredPath =
      typeof options.path === 'string' &&
      (!media.input ||
        options.path === media.input ||
        options.path.startsWith(`${media.input}/`))
        ? options.path
        : media.input
    const [path] = await uploadMediaFiles({
      coordinates: {
        owner: referenceContext.owner,
        repo: referenceContext.repo,
        branch: referenceContext.branch,
        name: media.name,
      },
      extensions,
      files: [file],
      limit: 1,
      path: configuredPath,
    })
    if (!path) return null
    return {
      src: mediaAssetUrl({ ...mediaContext, path }),
      alt: file.name,
    }
  }

  function requestImage() {
    if (!media || !mediaContext) return null
    pickerResolver.current?.(null)
    setPickerOpen(true)
    return new Promise<ImagePickerResult | null>((resolve) => {
      pickerResolver.current = resolve
    })
  }

  function closePicker(result: ImagePickerResult | null = null) {
    const resolve = pickerResolver.current
    pickerResolver.current = null
    setPickerOpen(false)
    resolve?.(result)
  }

  return (
    <>
      <div className="space-y-2">
        {mode === 'editor' ? (
          <Editor
            ariaLabel={label}
            disabled={disabled}
            editorId={id}
            enableImagePasteDrop={Boolean(mediaContext)}
            enableImages
            format={format}
            imageFallback={mediaContext ? 'none' : 'prompt-url'}
            value={editorValue}
            onChange={(nextValue) =>
              onChange(richTextValueForStorage(nextValue, media, mediaContext))
            }
            onPendingUploadsChange={onPendingUploadsChange}
            onRequestImage={mediaContext ? requestImage : undefined}
            onUploadImage={mediaContext ? uploadImage : undefined}
          />
        ) : (
          <Textarea
            aria-label={`${label} source`}
            className="font-mono"
            disabled={disabled}
            id={id}
            spellCheck={false}
            value={source}
            onChange={(event) => onChange(event.target.value)}
          />
        )}
      </div>
      {media && referenceContext && mediaContext ? (
        <MediaPickerDialog
          coordinates={{
            owner: referenceContext.owner,
            repo: referenceContext.repo,
            branch: referenceContext.branch,
            name: media.name,
          }}
          extensions={pickerExtensions}
          open={pickerOpen}
          rootPath={pickerPath}
          title="Choose an image"
          onOpenChange={(open) => {
            if (!open) closePicker()
          }}
          onSelect={(path) =>
            closePicker({
              kind: 'url',
              src: mediaAssetUrl({ ...mediaContext, path }),
            })
          }
        />
      ) : null}
    </>
  )
}
