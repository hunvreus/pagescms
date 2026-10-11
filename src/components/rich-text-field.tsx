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
import { parseUploadRename } from '#/lib/media-upload-name'
import {
  allowedMediaFieldExtensions,
  resolveFieldMedia,
} from '#/lib/media-field-values'

import type { ReferenceContext } from '#/components/structured-content-field'
import type {
  EditorSnippet,
  MarkdownHtmlPolicy,
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

function htmlPolicy(
  value: JsonValue | undefined,
): MarkdownHtmlPolicy | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return undefined
  const policy: MarkdownHtmlPolicy = {}
  for (const key of ['keep', 'strip', 'drop', 'attributes'] as const) {
    const entries = value[key]
    if (Array.isArray(entries))
      policy[key] = entries.filter(
        (entry): entry is string => typeof entry === 'string',
      )
  }
  return policy
}

function editorSnippets(value: JsonValue | undefined): EditorSnippet[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    if (
      !entry ||
      typeof entry !== 'object' ||
      Array.isArray(entry) ||
      typeof entry.label !== 'string' ||
      typeof entry.source !== 'string'
    )
      return []
    return [
      {
        label: entry.label,
        source: entry.source,
        ...(entry.format === 'html' || entry.format === 'markdown'
          ? { format: entry.format }
          : {}),
      },
    ]
  })
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
      rename: parseUploadRename(options.rename),
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
      <div className="min-h-16 space-y-2">
        {mode === 'editor' ? (
          <Editor
            ariaLabel={label}
            disabled={disabled}
            editorId={id}
            enableImagePasteDrop={Boolean(mediaContext)}
            enableImages
            format={format}
            markdownHtml={htmlPolicy(options.html)}
            snippets={editorSnippets(options.snippets)}
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
          initialPath={pickerPath}
          open={pickerOpen}
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
