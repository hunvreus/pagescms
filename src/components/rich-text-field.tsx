import { useLingui as useUiMessages } from '@lingui/react/macro'
import {
  bindMediaImage,
  mediaAssetQueryOptions,
} from '#/features/media/media-delivery'
import { useQueryClient } from '@tanstack/react-query'
import { authenticationQueryOptions } from '#/client/queries/session'
import { useEffect, useMemo, useRef, useState } from 'react'

import { Textarea } from '#/components/ui/textarea'
import { Editor } from '#/components/ui/editor'
import {
  richTextValueForEditor,
  richTextValueForStorage,
} from '#/features/editor/rich-text-media'
import { MediaPickerDialog } from '#/features/media/media-picker-dialog'
import {
  MEDIA_UPLOAD_LIMIT,
  uploadMediaFiles,
} from '#/features/media/media-upload'
import { mediaAssetUrl } from '#/lib/media-assets'
import { parseUploadRename } from '#/lib/media-upload-name'
import {
  allowedRichTextImageExtensions,
  resolveFieldMedia,
} from '#/lib/media-field-values'

import type { ReferenceContext } from '#/components/structured-content-field'
import type {
  EditorSnippet,
  MarkdownHtmlPolicy,
  ImagePickerResult,
  ImageUploadResult,
} from '#/components/ui/editor'
import type { JsonObject, JsonValue } from '#/shared/json'

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
  const { t: _t } = useUiMessages()

  const queryClient = useQueryClient()
  const mounted = useRef(false)
  const options = fieldOptions(field)
  const markdownHtml = useMemo(() => htmlPolicy(options.html), [options.html])
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
    ? allowedRichTextImageExtensions(field, media)
    : undefined
  const canUseImages = !media || Boolean(pickerExtensions?.length)
  const [pickerOpen, setPickerOpen] = useState(false)
  const pickerResolver = useRef<
    ((result: ImagePickerResult | null) => void) | null
  >(null)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      pickerResolver.current?.(null)
    }
  }, [])

  const editorValue = richTextValueForEditor(source, media, mediaContext)

  async function uploadImage(file: File): Promise<ImageUploadResult | null> {
    if (!media || !mediaContext || !referenceContext) return null
    const extensions = allowedRichTextImageExtensions(field, media)
    if (!extensions.length)
      throw new Error('No image types are allowed in this media library.')
    const configuredPath =
      typeof options.path === 'string' &&
      (!media.input ||
        options.path === media.input ||
        options.path.startsWith(`${media.input}/`))
        ? options.path
        : media.input
    const account = queryClient.getQueryData(
      authenticationQueryOptions().queryKey,
    )?.user?.id
    if (!account) return null
    const isActive = () =>
      queryClient.getQueryData(authenticationQueryOptions().queryKey)?.user
        ?.id === account
    const [path] = await uploadMediaFiles({
      isActive,
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
    if (!path || !mounted.current || !isActive()) return null
    const lease = await queryClient
      .fetchQuery(
        mediaAssetQueryOptions(queryClient, {
          ...mediaContext,
          path,
          variant: 'preview',
        }),
      )
      .catch(() => null)
    return {
      src: mediaAssetUrl({ ...mediaContext, path }),
      previewSrc: lease?.url ?? null,
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
      <div className="min-h-32 space-y-2">
        {mode === 'editor' ? (
          <Editor
            bindImage={(image, imageSource) => {
              if (!mediaContext) return undefined
              const prefix = mediaAssetUrl({ ...mediaContext, path: '' })
              if (!imageSource.startsWith(prefix)) return undefined
              let path: string
              try {
                path = imageSource
                  .slice(prefix.length)
                  .split('/')
                  .map(decodeURIComponent)
                  .join('/')
              } catch {
                return undefined
              }
              image.classList.add('invisible')
              return bindMediaImage(
                queryClient,
                { ...mediaContext, path, variant: 'preview' },
                image,
                ({ loaded, failed, loading }) => {
                  image.classList.toggle(
                    'invisible',
                    !loaded && (!failed || loading),
                  )
                },
              ).destroy
            }}
            ariaLabel={label}
            disabled={disabled}
            editorId={id}
            enableImagePasteDrop={Boolean(mediaContext) && canUseImages}
            enableImages={canUseImages}
            format={format}
            markdownHtml={markdownHtml}
            snippets={editorSnippets(options.snippets)}
            imageFallback={mediaContext ? 'none' : 'prompt-url'}
            value={editorValue}
            onChange={(nextValue) =>
              onChange(richTextValueForStorage(nextValue, media, mediaContext))
            }
            onPendingUploadsChange={onPendingUploadsChange}
            onRequestImage={
              mediaContext && canUseImages ? requestImage : undefined
            }
            maxImageBytes={MEDIA_UPLOAD_LIMIT}
            onUploadImage={
              mediaContext && canUseImages ? uploadImage : undefined
            }
          />
        ) : (
          <Textarea
            aria-label={_t({ message: `${label} source` })}
            className="min-h-32 font-mono"
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
          title={_t({ message: 'Choose an image' })}
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
