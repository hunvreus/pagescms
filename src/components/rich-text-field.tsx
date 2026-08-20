import { useEffect, useRef, useState } from 'react'
import {
  Bold,
  Code,
  Heading2,
  Image,
  Italic,
  Link,
  List,
  ListOrdered,
  Quote,
} from 'lucide-react'
import { marked } from 'marked'
import TurndownService from 'turndown'
import { gfm } from 'joplin-turndown-plugin-gfm'

import { Button } from '#/components/ui/button'
import { Textarea } from '#/components/ui/textarea'

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
  onChange,
}: {
  field: JsonObject
  value: JsonValue | undefined
  disabled: boolean
  required: boolean
  onChange: (value: JsonValue | undefined) => void
}) {
  const options = fieldOptions(field)
  const format = options.format === 'html' ? 'html' : 'markdown'
  const source = typeof value === 'string' ? value : ''
  const [mode, setMode] = useState<'visual' | 'source'>('visual')
  const editor = useRef<HTMLDivElement>(null)
  const lastVisualChange = useRef<string | null>(null)

  useEffect(() => {
    if (mode !== 'visual' || !editor.current) return
    if (
      document.activeElement === editor.current &&
      lastVisualChange.current === source
    ) {
      return
    }
    const html = format === 'html' ? source : markdownToHtml(source)
    const sanitized = sanitizeHtml(html)
    if (editor.current.innerHTML !== sanitized) {
      editor.current.innerHTML = sanitized
    }
  }, [format, mode, source])

  function emitVisual() {
    if (!editor.current) return
    const html = editor.current.innerHTML
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
              onRun={() => promptLink(true)}
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
    </div>
  )
}
