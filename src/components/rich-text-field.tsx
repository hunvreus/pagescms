import { useEffect, useRef, useState } from 'react'
import {
  ArrowUp,
  Bold,
  Code,
  Heading2,
  Image,
  Italic,
  Link,
  List,
  ListOrdered,
  Quote,
  Folder,
  LoaderCircle,
  Upload,
  X,
} from 'lucide-react'
import { marked } from 'marked'
import TurndownService from 'turndown'
import { gfm } from 'joplin-turndown-plugin-gfm'

import { Button } from '#/components/ui/button'
import { MediaThumbnail } from '#/components/media-thumbnail'
import { OperationError } from '#/components/operation-error'
import { Textarea } from '#/components/ui/textarea'
import { createMedia, getMedia } from '#/functions/media'
import { mediaAssetUrl } from '#/lib/media-assets'
import {
  allowedMediaFieldExtensions,
  mediaInputPath,
  mediaOutputPath,
  resolveFieldMedia,
} from '#/lib/media-field-values'

import type { ReferenceContext } from '#/components/structured-content-field'
import type { JsonObject, JsonValue } from '#/lib/json'

const turndown = new TurndownService({
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  emDelimiter: '*',
  headingStyle: 'atx',
})
turndown.use(gfm)

function fieldOptions(field: JsonObject) {
  return typeof field.options === 'object' &&
    field.options !== null &&
    !Array.isArray(field.options)
    ? field.options
    : {}
}

function sanitizeHtml(source: string) {
  const document = new DOMParser().parseFromString(source, 'text/html')
  for (const element of document.body.querySelectorAll(
    'script,style,iframe,object,embed,meta,link',
  )) {
    element.remove()
  }
  for (const element of document.body.querySelectorAll('*')) {
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase()
      const value = attribute.value.trim().toLowerCase()
      if (
        name.startsWith('on') ||
        ((name === 'href' || name === 'src') &&
          (value.startsWith('javascript:') ||
            (value.startsWith('data:') && !value.startsWith('data:image/'))))
      ) {
        element.removeAttribute(attribute.name)
      }
    }
  }
  return document.body.innerHTML
}

function markdownToHtml(value: string) {
  return marked.parse(value, { async: false })
}

function ToolbarButton({
  label,
  disabled,
  children,
  onRun,
}: {
  label: string
  disabled: boolean
  children: React.ReactNode
  onRun: () => void
}) {
  return (
    <Button
      aria-label={label}
      disabled={disabled}
      size="icon"
      type="button"
      variant="ghost"
      onMouseDown={(event) => event.preventDefault()}
      onClick={onRun}
    >
      {children}
    </Button>
  )
}

export default function RichTextField({
  field,
  value,
  disabled,
  required,
  referenceContext,
  onChange,
}: {
  field: JsonObject
  value: JsonValue | undefined
  disabled: boolean
  required: boolean
  referenceContext?: ReferenceContext
  onChange: (value: JsonValue | undefined) => void
}) {
  const options = fieldOptions(field)
  const format = options.format === 'html' ? 'html' : 'markdown'
  const source = typeof value === 'string' ? value : ''
  const media = resolveFieldMedia(field, referenceContext?.media ?? [])
  const [mode, setMode] = useState<'visual' | 'source'>('visual')
  const [mediaOpen, setMediaOpen] = useState(false)
  const editor = useRef<HTMLDivElement>(null)
  const lastVisualChange = useRef<string | null>(null)
  const savedSelection = useRef<Range | null>(null)

  useEffect(() => {
    if (mode !== 'visual' || !editor.current) return
    if (
      document.activeElement === editor.current &&
      lastVisualChange.current === source
    ) {
      return
    }
    const html = format === 'html' ? source : markdownToHtml(source)
    const sanitized = visualMediaHtml(sanitizeHtml(html))
    if (editor.current.innerHTML !== sanitized) {
      editor.current.innerHTML = sanitized
    }
  }, [format, mode, source])

  function visualMediaHtml(html: string) {
    if (!media || !referenceContext) return html
    const document = new DOMParser().parseFromString(html, 'text/html')
    for (const image of document.body.querySelectorAll('img')) {
      const src = image.getAttribute('src') ?? ''
      const path = mediaInputPath(src, media)
      if (
        !path ||
        /^(?:https?:)?\/\//i.test(path) ||
        path.startsWith('data:') ||
        (media.input &&
          path !== media.input &&
          !path.startsWith(`${media.input}/`))
      ) {
        continue
      }
      image.dataset.pagescmsPath = path
      image.src = mediaAssetUrl({
        ...referenceContext,
        name: media.name,
        path,
      })
    }
    return document.body.innerHTML
  }

  function emitVisual() {
    if (!editor.current) return
    const clone = editor.current.cloneNode(true) as HTMLDivElement
    for (const image of clone.querySelectorAll('img')) {
      const path = image.dataset.pagescmsPath
      if (path && media) image.setAttribute('src', mediaOutputPath(path, media))
      image.removeAttribute('data-pagescms-path')
    }
    const html = clone.innerHTML
    const next = format === 'html' ? html : turndown.turndown(html)
    lastVisualChange.current = next
    onChange(next)
  }

  function command(name: string, argument?: string) {
    editor.current?.focus()
    document.execCommand(name, false, argument)
    emitVisual()
  }

  function promptLink(image = false) {
    const url = window.prompt(image ? 'Image URL' : 'Link URL')?.trim()
    if (!url) return
    if (image) command('insertImage', url)
    else command('createLink', url)
  }

  function insertMediaImage(path: string) {
    if (!media || !referenceContext) return
    editor.current?.focus()
    const selection = window.getSelection()
    if (selection && savedSelection.current) {
      selection.removeAllRanges()
      selection.addRange(savedSelection.current)
    }
    const src = mediaAssetUrl({
      ...referenceContext,
      name: media.name,
      path,
    })
    const escapedSrc = src.replaceAll('&', '&amp;').replaceAll('"', '&quot;')
    const escapedPath = path.replaceAll('&', '&amp;').replaceAll('"', '&quot;')
    document.execCommand(
      'insertHTML',
      false,
      `<img src="${escapedSrc}" data-pagescms-path="${escapedPath}" alt="">`,
    )
    emitVisual()
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-background">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 p-1">
        {mode === 'visual' ? (
          <div className="flex flex-wrap">
            <ToolbarButton
              disabled={disabled}
              label="Bold"
              onRun={() => command('bold')}
            >
              <Bold />
            </ToolbarButton>
            <ToolbarButton
              disabled={disabled}
              label="Italic"
              onRun={() => command('italic')}
            >
              <Italic />
            </ToolbarButton>
            <ToolbarButton
              disabled={disabled}
              label="Heading"
              onRun={() => command('formatBlock', 'h2')}
            >
              <Heading2 />
            </ToolbarButton>
            <ToolbarButton
              disabled={disabled}
              label="Bulleted list"
              onRun={() => command('insertUnorderedList')}
            >
              <List />
            </ToolbarButton>
            <ToolbarButton
              disabled={disabled}
              label="Numbered list"
              onRun={() => command('insertOrderedList')}
            >
              <ListOrdered />
            </ToolbarButton>
            <ToolbarButton
              disabled={disabled}
              label="Quote"
              onRun={() => command('formatBlock', 'blockquote')}
            >
              <Quote />
            </ToolbarButton>
            <ToolbarButton
              disabled={disabled}
              label="Code block"
              onRun={() => command('formatBlock', 'pre')}
            >
              <Code />
            </ToolbarButton>
            <ToolbarButton
              disabled={disabled}
              label="Link"
              onRun={() => promptLink()}
            >
              <Link />
            </ToolbarButton>
            <ToolbarButton
              disabled={disabled}
              label="Image"
              onRun={() => {
                const selection = window.getSelection()
                if (
                  selection?.rangeCount &&
                  editor.current?.contains(selection.anchorNode)
                ) {
                  savedSelection.current = selection.getRangeAt(0).cloneRange()
                }
                if (media && referenceContext) {
                  setMediaOpen((current) => !current)
                } else {
                  promptLink(true)
                }
              }}
            >
              <Image />
            </ToolbarButton>
          </div>
        ) : (
          <span className="px-2 text-xs text-muted-foreground">
            {format === 'html' ? 'HTML' : 'Markdown'} source
          </span>
        )}
        {options.switcher !== false ? (
          <Button
            size="sm"
            type="button"
            variant="ghost"
            onClick={() => setMode(mode === 'visual' ? 'source' : 'visual')}
          >
            {mode === 'visual' ? 'Source' : 'Visual'}
          </Button>
        ) : null}
      </div>
      {mode === 'visual' ? (
        <div
          aria-label={String(field.name)}
          aria-required={required}
          className="min-h-48 px-4 py-3 text-sm leading-7 outline-none [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:pl-4 [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_h1]:text-2xl [&_h1]:font-semibold [&_h2]:text-xl [&_h2]:font-semibold [&_img]:max-w-full [&_ol]:list-decimal [&_ol]:pl-6 [&_pre]:overflow-auto [&_pre]:rounded [&_pre]:bg-muted [&_pre]:p-3 [&_ul]:list-disc [&_ul]:pl-6"
          contentEditable={!disabled}
          ref={editor}
          role="textbox"
          suppressContentEditableWarning
          onBlur={emitVisual}
          onInput={emitVisual}
          onPaste={(event) => {
            const html = event.clipboardData.getData('text/html')
            if (!html) return
            event.preventDefault()
            document.execCommand('insertHTML', false, sanitizeHtml(html))
          }}
        />
      ) : (
        <Textarea
          aria-label={String(field.name)}
          className="min-h-48 resize-y rounded-none border-0 font-mono focus-visible:ring-0"
          disabled={disabled}
          required={required}
          value={source}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {mode === 'visual' && mediaOpen && media && referenceContext ? (
        <RichTextMediaBrowser
          context={referenceContext}
          field={field}
          media={media}
          onClose={() => setMediaOpen(false)}
          onSelect={(path) => {
            insertMediaImage(path)
            setMediaOpen(false)
          }}
        />
      ) : null}
    </div>
  )
}

function fileBase64(file: globalThis.File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`))
    reader.onload = () => {
      const result = String(reader.result)
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.readAsDataURL(file)
  })
}

function RichTextMediaBrowser({
  context,
  field,
  media,
  onClose,
  onSelect,
}: {
  context: ReferenceContext
  field: JsonObject
  media: NonNullable<ReturnType<typeof resolveFieldMedia>>
  onClose: () => void
  onSelect: (path: string) => void
}) {
  const options = fieldOptions(field)
  const configuredPath =
    typeof options.path === 'string' &&
    (!media.input ||
      options.path === media.input ||
      options.path.startsWith(`${media.input}/`))
      ? options.path
      : media.input
  const [path, setPath] = useState(configuredPath)
  const [entries, setEntries] = useState<
    Array<{
      type: 'file' | 'dir'
      name: string
      path: string
      sha: string | null
      size: number | null
    }>
  >([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const extensions = allowedMediaFieldExtensions(
    { ...field, type: 'image' },
    media,
  )

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    void getMedia({
      data: {
        owner: context.owner,
        repo: context.repo,
        branch: context.branch,
        name: media.name,
        path,
      },
    })
      .then((result) => {
        if (!cancelled) setEntries(result.entries)
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [context.branch, context.owner, context.repo, media.name, path])

  async function upload(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      if (file.size > 20 * 1024 * 1024) {
        throw new Error(`${file.name} exceeds the 20 MB limit`)
      }
      const extension = file.name.split('.').at(-1)?.toLowerCase() ?? ''
      if (extensions?.length && !extensions.includes(extension)) {
        throw new Error(`${file.name} uses a disallowed file extension`)
      }
      const result = await createMedia({
        data: {
          owner: context.owner,
          repo: context.repo,
          branch: context.branch,
          name: media.name,
          path,
          filename: file.name,
          content: await fileBase64(file),
        },
      })
      onSelect(result.path)
    } catch (cause) {
      setError(cause)
    } finally {
      setUploading(false)
    }
  }

  const visible = entries.filter(
    (entry) =>
      entry.type === 'dir' ||
      !extensions?.length ||
      extensions.includes(entry.name.split('.').at(-1)?.toLowerCase() ?? ''),
  )

  return (
    <div className="space-y-3 border-t bg-muted/10 p-3">
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {path}
        </p>
        <Button asChild size="sm" variant="outline">
          <label>
            {uploading ? <LoaderCircle className="animate-spin" /> : <Upload />}
            Upload
            <input
              accept={extensions?.map((value) => `.${value}`).join(',')}
              className="sr-only"
              disabled={uploading}
              type="file"
              onChange={(event) => {
                void upload(event.target.files)
                event.target.value = ''
              }}
            />
          </label>
        </Button>
        <Button
          aria-label="Close media browser"
          size="icon"
          type="button"
          variant="ghost"
          onClick={onClose}
        >
          <X />
        </Button>
      </div>
      {path !== media.input ? (
        <Button
          size="sm"
          type="button"
          variant="outline"
          onClick={() => {
            const parent = path.split('/').slice(0, -1).join('/')
            setPath(parent.startsWith(media.input) ? parent : media.input)
          }}
        >
          <ArrowUp /> Parent folder
        </Button>
      ) : null}
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading media…</p>
      ) : visible.length ? (
        <ul className="grid max-h-72 grid-cols-2 gap-2 overflow-auto sm:grid-cols-3">
          {visible.map((entry) => (
            <li key={entry.path}>
              <button
                className="flex w-full items-center gap-2 rounded-lg border bg-background p-2 text-left text-xs hover:bg-muted"
                type="button"
                onClick={() =>
                  entry.type === 'dir'
                    ? setPath(entry.path)
                    : onSelect(entry.path)
                }
              >
                {entry.type === 'dir' ? (
                  <Folder className="size-8 shrink-0 text-muted-foreground" />
                ) : (
                  <MediaThumbnail
                    {...context}
                    className="size-12"
                    name={media.name}
                    path={entry.path}
                  />
                )}
                <span className="min-w-0 truncate">{entry.name}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No images found.</p>
      )}
      <OperationError error={error} fallback="Could not load media." />
    </div>
  )
}
