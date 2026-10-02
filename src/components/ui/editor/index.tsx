import { useEffect, useRef, useState } from 'react'
import type { HTMLAttributes } from 'react'
import { Node as TiptapNode, mergeAttributes } from '@tiptap/core'
import type { Editor as TiptapEditor } from '@tiptap/core'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import { Table } from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableHeader from '@tiptap/extension-table-header'
import TableCell from '@tiptap/extension-table-cell'
import { Markdown } from '@tiptap/markdown'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { TextSelection } from '@tiptap/pm/state'
import {
  Bold,
  Check,
  ChevronDownIcon,
  Code,
  Minus,
  Plus,
  RemoveFormatting,
  Table as TableIcon,
  Italic,
  Link as LinkIcon,
  Strikethrough,
  Underline as UnderlineIcon,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '#/lib/utils.ts'
import './typeset.css'
import SlashCommands from './slash-command/commands'
import type {
  ImagePickerContext,
  ImagePickerFileResult,
  ImagePickerHandler,
  ImagePickerResult,
  ImagePickerUrlResult,
  SlashImageFallback,
} from './slash-command/suggestion'

export type EditorFormat = 'html' | 'markdown'
export type ImageFallbackMode = 'data-url' | 'prompt-url' | 'none'
export type MarkdownHtmlPolicy = {
  keep?: string[]
  strip?: string[]
  drop?: string[]
}
export type ImageUploadContext = {
  editor: TiptapEditor
  source: 'paste' | 'drop' | 'slash'
}
export type ImageUploadResult = {
  src: string
  alt?: string
  title?: string
}
export type ImageUploadHandler = (
  file: File,
  context: ImageUploadContext,
) => ImageUploadResult | null | Promise<ImageUploadResult | null>

const DEFAULT_MAX_IMAGE_BYTES = 1_000_000
const UPLOADED_IMAGE_PRELOAD_TIMEOUT_MS = 8_000
const MARKDOWN_TABLE_ROW_PATTERN = /^\s*\|.*\|\s*$/
const MARKDOWN_TABLE_DELIMITER_CELL_PATTERN = /^:?-{3,}:?$/
const TABLE_CELL_NBSP_PATTERN = /^(?:&nbsp;|\u00A0)+$/i

const RAW_MARKDOWN_HTML_BLOCK = 'rawMarkdownHtmlBlock'
const RAW_MARKDOWN_HTML_INLINE = 'rawMarkdownHtmlInline'
const DROPPED_MARKDOWN_HTML_BLOCK = 'droppedMarkdownHtmlBlock'
const DROPPED_MARKDOWN_HTML_INLINE = 'droppedMarkdownHtmlInline'

const normalizeMarkdownHtmlSelectors = (
  selectors: string[] | undefined,
): string[] =>
  Array.isArray(selectors)
    ? selectors.map((selector) => selector.trim()).filter(Boolean)
    : []

const getMarkdownHtmlRootElement = (html: string): Element | null => {
  if (typeof window === 'undefined') return null
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return doc.body.firstElementChild
}

const getMarkdownHtmlTopLevelNodes = (html: string): ChildNode[] => {
  if (typeof window === 'undefined') return []
  const template = document.createElement('template')
  template.innerHTML = html.trim()
  return Array.from(template.content.childNodes)
}

const createRawMarkdownHtmlDom = (
  html: string,
  fallbackTag: 'div' | 'span',
): HTMLElement => {
  const template = document.createElement('template')
  template.innerHTML = html.trim()
  const element = template.content.firstElementChild

  if (element instanceof HTMLElement) {
    return element
  }

  const fallback = document.createElement(fallbackTag)
  fallback.textContent = html
  return fallback
}

const markdownHtmlTextContent = (html: string): string => {
  if (typeof window === 'undefined') {
    return html
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  const doc = new DOMParser().parseFromString(html, 'text/html')
  return doc.body.textContent.replace(/\s+/g, ' ').trim()
}

const createMarkdownHtmlTextNode = (html: string, block?: boolean) => {
  const text = markdownHtmlTextContent(html)
  if (!text) return createDroppedMarkdownHtmlNode(block)

  const textNode = { type: 'text', text }
  return block ? { type: 'paragraph', content: [textNode] } : textNode
}

const createDroppedMarkdownHtmlNode = (block?: boolean) => ({
  type: block ? DROPPED_MARKDOWN_HTML_BLOCK : DROPPED_MARKDOWN_HTML_INLINE,
})

const createRawMarkdownHtmlNode = (html: string, block?: boolean) => ({
  type: block ? RAW_MARKDOWN_HTML_BLOCK : RAW_MARKDOWN_HTML_INLINE,
  attrs: { html },
})

const markdownHtmlSelectorMatches = (
  element: Element,
  selector: string,
): boolean => {
  try {
    return element.matches(selector)
  } catch (error) {
    console.warn(`Ignoring invalid markdownHtml selector "${selector}".`, error)
    return false
  }
}

const markdownHtmlMatches = (
  element: Element,
  selectors: string[] | undefined,
): boolean =>
  normalizeMarkdownHtmlSelectors(selectors).some((selector) =>
    markdownHtmlSelectorMatches(element, selector),
  )

const getMarkdownHtmlAction = (
  html: string,
  policy?: MarkdownHtmlPolicy,
): 'keep' | 'strip' | 'drop' | null => {
  if (!policy) return null
  const root = getMarkdownHtmlRootElement(html)
  if (!root) return null
  if (markdownHtmlMatches(root, policy.drop)) return 'drop'
  if (markdownHtmlMatches(root, policy.strip)) return 'strip'
  if (markdownHtmlMatches(root, policy.keep)) return 'keep'
  return null
}

const createMarkdownHtmlPolicyNode = (
  html: string,
  action: 'keep' | 'strip' | 'drop',
  block?: boolean,
) => {
  if (action === 'drop') return createDroppedMarkdownHtmlNode(block)
  if (action === 'strip') return createMarkdownHtmlTextNode(html, block)
  return createRawMarkdownHtmlNode(html, block)
}

const createMarkdownHtmlPolicyNodes = (
  html: string,
  policy: MarkdownHtmlPolicy | undefined,
  block?: boolean,
) => {
  const topLevelNodes = getMarkdownHtmlTopLevelNodes(html)
  if (topLevelNodes.length <= 1) {
    const action = getMarkdownHtmlAction(html, policy)
    return action ? createMarkdownHtmlPolicyNode(html, action, block) : []
  }

  const parsedNodes = topLevelNodes.flatMap((node) => {
    if (node instanceof Text) {
      const text = node.textContent.replace(/\s+/g, ' ').trim()
      return text
        ? [
            block
              ? { type: 'paragraph', content: [{ type: 'text', text }] }
              : { type: 'text', text },
          ]
        : []
    }

    if (!(node instanceof Element)) return []

    const outerHTML = node.outerHTML
    const action = getMarkdownHtmlAction(outerHTML, policy)
    return action
      ? [createMarkdownHtmlPolicyNode(outerHTML, action, block)]
      : [createMarkdownHtmlTextNode(outerHTML, block)]
  })

  return parsedNodes.some(
    (node) =>
      node.type === RAW_MARKDOWN_HTML_BLOCK ||
      node.type === RAW_MARKDOWN_HTML_INLINE ||
      node.type === DROPPED_MARKDOWN_HTML_BLOCK ||
      node.type === DROPPED_MARKDOWN_HTML_INLINE,
  )
    ? parsedNodes
    : []
}

const tokenizeInlineMarkdownHtml = (
  src: string,
  policy?: MarkdownHtmlPolicy,
) => {
  if (!src.startsWith('<')) return undefined

  const selfClosingMatch = src.match(/^<[a-z][\w-]*(?:\s[^<>]*)?\/>/i)
  if (selfClosingMatch) {
    const raw = selfClosingMatch[0]
    return getMarkdownHtmlAction(raw, policy)
      ? { type: RAW_MARKDOWN_HTML_INLINE, raw, text: raw }
      : undefined
  }

  const openMatch = src.match(/^<([a-z][\w-]*)(?:\s[^<>]*)?>/i)
  if (!openMatch) return undefined

  const closingPattern = new RegExp(`<\\/\\s*${openMatch[1]}\\s*>`, 'i')
  const closingMatch = closingPattern.exec(src.slice(openMatch[0].length))
  if (!closingMatch) return undefined

  const end = openMatch[0].length + closingMatch.index + closingMatch[0].length
  const raw = src.slice(0, end)
  return getMarkdownHtmlAction(raw, policy)
    ? { type: RAW_MARKDOWN_HTML_INLINE, raw, text: raw }
    : undefined
}

const createRawMarkdownHtmlExtensions = (policy?: MarkdownHtmlPolicy) => [
  TiptapNode.create({
    name: DROPPED_MARKDOWN_HTML_INLINE,
    group: 'inline',
    inline: true,
    atom: true,
    selectable: false,
    draggable: false,

    renderHTML() {
      return ['span', { 'data-dropped-markdown-html': '', hidden: 'true' }]
    },

    renderMarkdown() {
      return ''
    },
  }),
  TiptapNode.create({
    name: DROPPED_MARKDOWN_HTML_BLOCK,
    group: 'block',
    atom: true,
    selectable: false,
    draggable: false,

    renderHTML() {
      return ['div', { 'data-dropped-markdown-html': '', hidden: 'true' }]
    },

    renderMarkdown() {
      return ''
    },
  }),
  TiptapNode.create({
    name: RAW_MARKDOWN_HTML_INLINE,
    group: 'inline',
    inline: true,
    atom: true,
    selectable: false,
    draggable: false,

    addAttributes() {
      return {
        html: {
          default: '',
          parseHTML: (element: HTMLElement) =>
            element.getAttribute('data-raw-markdown-html') ?? '',
          renderHTML: () => ({}),
        },
      }
    },

    parseHTML() {
      return [{ tag: 'span[data-raw-markdown-html]' }]
    },

    markdownTokenizer: {
      name: RAW_MARKDOWN_HTML_INLINE,
      level: 'inline',
      start: '<',
      tokenize: (src: string) => tokenizeInlineMarkdownHtml(src, policy),
    },

    markdownTokenName: RAW_MARKDOWN_HTML_INLINE,

    parseMarkdown(token) {
      const html = String(token.raw || token.text || '')
      if (!html.trim()) return []
      return createMarkdownHtmlPolicyNodes(html, policy, false)
    },

    addNodeView() {
      return ({ node }) => ({
        dom: createRawMarkdownHtmlDom(
          typeof node.attrs['html'] === 'string' ? node.attrs['html'] : '',
          'span',
        ),
      })
    },

    renderHTML({ node, HTMLAttributes }) {
      const html =
        typeof node.attrs['html'] === 'string' ? node.attrs['html'] : ''
      return [
        'span',
        mergeAttributes(HTMLAttributes, {
          'data-raw-markdown-html': html,
          contenteditable: 'false',
        }),
        html,
      ]
    },

    renderMarkdown(node) {
      return typeof node.attrs?.['html'] === 'string' ? node.attrs['html'] : ''
    },
  }),
  TiptapNode.create({
    name: RAW_MARKDOWN_HTML_BLOCK,
    group: 'block',
    atom: true,
    selectable: false,
    draggable: false,

    addAttributes() {
      return {
        html: {
          default: '',
          parseHTML: (element: HTMLElement) =>
            element.getAttribute('data-raw-markdown-html') ?? '',
          renderHTML: () => ({}),
        },
      }
    },

    parseHTML() {
      return [{ tag: 'div[data-raw-markdown-html]' }]
    },

    addNodeView() {
      return ({ node }) => ({
        dom: createRawMarkdownHtmlDom(
          typeof node.attrs['html'] === 'string' ? node.attrs['html'] : '',
          'div',
        ),
      })
    },

    renderHTML({ node, HTMLAttributes }) {
      const html =
        typeof node.attrs['html'] === 'string' ? node.attrs['html'] : ''
      return [
        'div',
        mergeAttributes(HTMLAttributes, {
          'data-raw-markdown-html': html,
          contenteditable: 'false',
        }),
        html,
      ]
    },

    markdownTokenName: 'html',

    parseMarkdown(token) {
      const html = String(token.raw || token.text || '')
      if (!html.trim()) return []
      return createMarkdownHtmlPolicyNodes(html, policy, token['block'])
    },

    renderMarkdown(node) {
      return typeof node.attrs?.['html'] === 'string' ? node.attrs['html'] : ''
    },
  }),
]

function markdownImageDestination(value: string) {
  const encoded = encodeURI(value).replace(/%25([0-9A-Fa-f]{2})/g, '%$1')
  return /[()]/.test(encoded) ? `<${encoded}>` : encoded
}

const UploadableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      uploadId: {
        default: null,
        parseHTML: (element: HTMLElement) =>
          element.getAttribute('data-upload-id'),
        renderHTML: (attributes: { uploadId?: string | null }) =>
          attributes.uploadId ? { 'data-upload-id': attributes.uploadId } : {},
      },
      uploading: {
        default: false,
        parseHTML: (element: HTMLElement) =>
          element.getAttribute('data-uploading') === 'true',
        renderHTML: (attributes: { uploading?: boolean }) =>
          attributes.uploading ? { 'data-uploading': 'true' } : {},
      },
      uploadError: {
        default: null,
        parseHTML: (element: HTMLElement) =>
          element.getAttribute('data-upload-error'),
        renderHTML: (attributes: { uploadError?: string | null }) =>
          attributes.uploadError
            ? { 'data-upload-error': attributes.uploadError }
            : {},
      },
    }
  },

  parseMarkdown(token, helpers) {
    return helpers.createNode('image', {
      src: token['href'],
      title: token['title'],
      alt: token.text,
    })
  },

  renderMarkdown(node) {
    const attrs = toUploadableAttrs(node.attrs)
    const src = markdownImageDestination(String(attrs.src ?? ''))
    const alt = String(attrs.alt ?? '')
    const title = String(attrs.title ?? '')

    return title ? `![${alt}](${src} "${title}")` : `![${alt}](${src})`
  },
})

export type EditorProps = {
  value?: string
  onChange?: (value: string) => void
  disabled?: boolean
  format?: EditorFormat
  enableImages?: boolean
  enableImagePasteDrop?: boolean
  onUploadImage?: ImageUploadHandler
  imageFallback?: ImageFallbackMode
  maxImageBytes?: number
  onRequestImage?: ImagePickerHandler
  onPendingUploadsChange?: (count: number) => void
  markdownHtml?: MarkdownHtmlPolicy
  className?: string
  editorClassName?: string
  ariaLabel?: string
  editorId?: string
} & Omit<HTMLAttributes<HTMLDivElement>, 'onChange' | 'className'>
export type {
  ImagePickerContext,
  ImagePickerFileResult,
  ImagePickerHandler,
  ImagePickerResult,
  ImagePickerUrlResult,
  SlashImageFallback,
}

type ToggleAction = {
  label: string
  icon: LucideIcon
  isActive: () => boolean
  run: () => void
  toggle: true
}

type PlainAction = {
  label: string
  icon: LucideIcon
  run: () => void
  toggle?: false
}

type MenuAction = ToggleAction | PlainAction

type IconButtonOptions = {
  label: string
  icon: LucideIcon
  onClick: () => void
  disabled: boolean
  toggle?: boolean
  pressed?: boolean
  className?: string
}

type BlockType =
  | 'paragraph'
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'bulletList'
  | 'orderedList'
  | 'blockquote'
  | 'codeBlock'

type ActiveState = {
  blockType: BlockType
  bold: boolean
  italic: boolean
  underline: boolean
  strike: boolean
  code: boolean
  link: boolean
}

const defaultActiveState: ActiveState = {
  blockType: 'paragraph',
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  code: false,
  link: false,
}

type UploadableImageAttrs = {
  src?: unknown
  alt?: unknown
  title?: unknown
  uploadId?: unknown
  uploading?: unknown
  uploadError?: unknown
  [key: string]: unknown
}

const toUploadableAttrs = (attrs: unknown): UploadableImageAttrs => {
  if (!attrs || typeof attrs !== 'object') return {}
  return attrs as UploadableImageAttrs
}

const splitMarkdownTableCells = (line: string): string[] => {
  const trimmed = line.trim()
  if (trimmed.length < 2 || !trimmed.startsWith('|') || !trimmed.endsWith('|'))
    return []

  const row = trimmed.slice(1, -1)
  const cells: string[] = []
  let start = 0

  for (let index = 0; index < row.length; index += 1) {
    if (row[index] !== '|') continue

    let slashCount = 0
    for (
      let slashIndex = index - 1;
      slashIndex >= 0 && row[slashIndex] === '\\';
      slashIndex -= 1
    ) {
      slashCount += 1
    }
    if (slashCount % 2 === 1) continue

    cells.push(row.slice(start, index))
    start = index + 1
  }

  cells.push(row.slice(start))
  return cells
}

const isMarkdownTableDelimiterLine = (line: string): boolean => {
  if (!MARKDOWN_TABLE_ROW_PATTERN.test(line)) return false
  const cells = splitMarkdownTableCells(line)
  if (!cells.length) return false
  return cells.every((cell) =>
    MARKDOWN_TABLE_DELIMITER_CELL_PATTERN.test(cell.trim()),
  )
}

const normalizeMarkdownTables = (markdown: string): string =>
  markdown
    .split('\n')
    .map((line) => {
      if (
        !MARKDOWN_TABLE_ROW_PATTERN.test(line) ||
        isMarkdownTableDelimiterLine(line)
      )
        return line

      const cells = splitMarkdownTableCells(line)
      if (!cells.length) return line

      const normalizedCells = cells.map((cell) =>
        TABLE_CELL_NBSP_PATTERN.test(cell.trim()) ? '' : cell.trim(),
      )
      return `| ${normalizedCells.join(' | ')} |`
    })
    .join('\n')

const normalizeMarkdownBlankLines = (markdown: string): string => {
  const lines = markdown.split('\n')
  const normalized: string[] = []
  let blankCount = 0
  let inFence = false

  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence
      blankCount = 0
      normalized.push(line)
      continue
    }

    const trimmedLine = line.trim()
    const isBlankLine =
      trimmedLine === '' || /^(?:&nbsp;|\u00A0)+$/i.test(trimmedLine)

    if (!inFence && isBlankLine) {
      blankCount += 1
      if (blankCount > 1) continue
    } else {
      blankCount = 0
    }

    normalized.push(line)
  }

  return normalized.join('\n').trimEnd()
}

const normalizeMarkdown = (markdown: string): string =>
  normalizeMarkdownBlankLines(normalizeMarkdownTables(markdown))

const blockOptions: Array<{ value: BlockType; label: string }> = [
  { value: 'paragraph', label: 'Text' },
  { value: 'heading1', label: 'Heading 1' },
  { value: 'heading2', label: 'Heading 2' },
  { value: 'heading3', label: 'Heading 3' },
  { value: 'bulletList', label: 'Bulleted list' },
  { value: 'orderedList', label: 'Numbered list' },
  { value: 'blockquote', label: 'Quote' },
  { value: 'codeBlock', label: 'Code block' },
]

export function Editor({
  value = '',
  onChange = () => undefined,
  disabled = false,
  format = 'html',
  enableImages = true,
  enableImagePasteDrop = false,
  onUploadImage,
  imageFallback = 'prompt-url',
  maxImageBytes = DEFAULT_MAX_IMAGE_BYTES,
  onRequestImage,
  onPendingUploadsChange,
  markdownHtml,
  className,
  editorClassName,
  ariaLabel,
  editorId,
  ...props
}: EditorProps) {
  const [showLinkInput, setShowLinkInput] = useState(false)
  const [showTableActions, setShowTableActions] = useState(false)
  const [showAltInput, setShowAltInput] = useState(false)
  const [isInTable, setIsInTable] = useState(false)
  const [isOnImage, setIsOnImage] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [imageAltText, setImageAltText] = useState('')
  const bubbleMenuRef = useRef<HTMLDivElement>(null)
  const linkInputRef = useRef<HTMLInputElement>(null)
  const lastEmittedValueRef = useRef<string>(
    format === 'markdown' ? normalizeMarkdown(value) : value,
  )
  const lastObservedFormatRef = useRef<EditorFormat>(format)
  const lastObservedValueRef = useRef<string>(lastEmittedValueRef.current)
  const pendingUploadsRef = useRef(0)
  const objectUrlByUploadIdRef = useRef(new Map<string, string>())
  const expectedBlobByUploadIdRef = useRef(new Map<string, string>())
  const tiptapSurfaceClass = cn(
    'typeset typeset-editor border-input placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 min-h-16 w-full rounded-md border bg-transparent px-3 py-2 shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] [&_p.is-empty::before]:text-muted-foreground [&_p.is-empty::before]:content-[attr(data-placeholder)] [&_p.is-empty::before]:pointer-events-none [&_p.is-empty::before]:float-left [&_p.is-empty::before]:h-0 [&_td_p.is-empty::before]:content-none [&_th_p.is-empty::before]:content-none [&_img[data-uploading=true]]:opacity-70 [&_img[data-uploading=true]]:animate-pulse [&_img[data-upload-error]]:ring-2 [&_img[data-upload-error]]:ring-destructive [&_img[data-upload-error]]:ring-offset-2 [&_img[data-upload-error]]:ring-offset-background',
    editorClassName,
  )

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        link: false,
        underline: false,
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        enableClickSelection: true,
        HTMLAttributes: {
          rel: null,
          target: null,
        },
      }),
      UploadableImage,
      Table,
      TableRow,
      TableHeader,
      TableCell,
      ...createRawMarkdownHtmlExtensions(markdownHtml),
      Placeholder.configure({
        placeholder: ({
          node,
          editor: currentEditor,
        }: {
          node: ProseMirrorNode
          editor: TiptapEditor
        }): string =>
          node.type.name === 'paragraph' &&
          !currentEditor.isActive('tableCell') &&
          !currentEditor.isActive('tableHeader')
            ? "Press '/' for commands"
            : '',
        showOnlyCurrent: true,
      }),
      Markdown,
      SlashCommands.configure({
        onRequestImage: enableImages ? (onRequestImage ?? null) : null,
        onInsertLocalImageFile: ({ file, alt, title }) => {
          void insertLocalImageFile(file, 'slash', {
            ...(alt ? { alt } : {}),
            ...(title ? { title } : {}),
          })
        },
        enableImages,
        imageSlashFallback:
          imageFallback === 'prompt-url' ? 'prompt-url' : 'none',
      }),
    ],
    content: value || (format === 'markdown' ? '' : '<p></p>'),
    contentType: format,
    editorProps: {
      attributes: {
        'aria-label': ariaLabel ?? 'Rich text editor',
        'aria-multiline': 'true',
        class: tiptapSurfaceClass,
        role: 'textbox',
        ...(editorId ? { id: editorId } : {}),
      },
      handlePaste: (_view, event) => {
        if (!enableImages || !enableImagePasteDrop) return false
        const files = Array.from(event.clipboardData?.files ?? []).filter(
          (file) => file.type.startsWith('image/'),
        )
        if (!files.length) return false
        void insertImagesFromFiles(files, 'paste')
        return true
      },
      handleDrop: (view, event, _slice, moved) => {
        if (moved || !enableImages || !enableImagePasteDrop) return false
        const files = Array.from(event.dataTransfer?.files ?? []).filter(
          (file) => file.type.startsWith('image/'),
        )
        if (!files.length) return false

        const coords = view.posAtCoords({
          left: event.clientX,
          top: event.clientY,
        })
        if (coords?.pos != null) {
          view.dispatch(
            view.state.tr.setSelection(
              TextSelection.create(view.state.doc, coords.pos),
            ),
          )
        }

        void insertImagesFromFiles(files, 'drop')
        return true
      },
    },
    editable: !disabled,
    immediatelyRender: false,
    onUpdate: ({ editor: nextEditor }) => {
      const nextValue =
        format === 'markdown'
          ? normalizeMarkdown(nextEditor.getMarkdown())
          : nextEditor
              .getHTML()
              .replace(/\sdata-upload-id="[^"]*"/g, '')
              .replace(/\sdata-uploading="[^"]*"/g, '')
              .replace(/\sdata-upload-error="[^"]*"/g, '')
      if (nextValue === lastEmittedValueRef.current) return
      lastEmittedValueRef.current = nextValue
      onChange(nextValue)
    },
  })

  const activeState =
    useEditorState({
      editor,
      selector: ({ editor: currentEditor }) => {
        if (!currentEditor) {
          return defaultActiveState
        }

        const blockType: BlockType = currentEditor.isActive('heading', {
          level: 1,
        })
          ? 'heading1'
          : currentEditor.isActive('heading', { level: 2 })
            ? 'heading2'
            : currentEditor.isActive('heading', { level: 3 })
              ? 'heading3'
              : currentEditor.isActive('bulletList')
                ? 'bulletList'
                : currentEditor.isActive('orderedList')
                  ? 'orderedList'
                  : currentEditor.isActive('blockquote')
                    ? 'blockquote'
                    : currentEditor.isActive('codeBlock')
                      ? 'codeBlock'
                      : 'paragraph'

        return {
          blockType,
          bold: currentEditor.isActive('bold'),
          italic: currentEditor.isActive('italic'),
          underline: currentEditor.isActive('underline'),
          strike: currentEditor.isActive('strike'),
          code: currentEditor.isActive('code'),
          link: currentEditor.isActive('link'),
        }
      },
    }) ?? defaultActiveState

  useEffect(() => {
    if (!editor) return
    const externalValue =
      format === 'markdown' ? normalizeMarkdown(value) : value
    const formatChanged = lastObservedFormatRef.current !== format
    const valueChanged = lastObservedValueRef.current !== externalValue
    if (!formatChanged && !valueChanged) return

    lastObservedFormatRef.current = format
    lastObservedValueRef.current = externalValue
    if (!formatChanged && externalValue === lastEmittedValueRef.current) return

    const current =
      format === 'markdown'
        ? normalizeMarkdown(editor.getMarkdown())
        : editor.getHTML()
    const hasChanged = externalValue !== current

    if (hasChanged) {
      editor.commands.setContent(
        value || (format === 'markdown' ? '' : '<p></p>'),
        {
          emitUpdate: false,
          contentType: format,
        },
      )
      lastEmittedValueRef.current = externalValue
    }
  }, [editor, value, format])

  useEffect(() => {
    if (!editor) return
    editor.setEditable(!disabled)
  }, [editor, disabled])

  useEffect(() => {
    if (!editor) return
    editor.setOptions({
      editorProps: {
        attributes: {
          'aria-label': ariaLabel ?? 'Rich text editor',
          'aria-multiline': 'true',
          class: tiptapSurfaceClass,
          role: 'textbox',
          ...(editorId ? { id: editorId } : {}),
        },
      },
    })
  }, [ariaLabel, editor, editorId, tiptapSurfaceClass])

  useEffect(() => {
    if ((!showLinkInput && !showTableActions && !showAltInput) || !editor)
      return

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (!target) return

      const insideBubble = bubbleMenuRef.current?.contains(target) ?? false
      if (!insideBubble) {
        setShowLinkInput(false)
        setShowTableActions(false)
        setShowAltInput(false)
      }
    }

    document.addEventListener('pointerdown', onPointerDown, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
    }
  }, [showLinkInput, showTableActions, showAltInput, editor])

  useEffect(() => {
    if (!showLinkInput) return
    const frameId = requestAnimationFrame(() => {
      linkInputRef.current?.focus()
      linkInputRef.current?.select()
    })
    return () => cancelAnimationFrame(frameId)
  }, [showLinkInput])

  useEffect(() => {
    if (!editor) return

    const updateTableContext = () => {
      const nextIsInTable =
        editor.isActive('table') ||
        editor.isActive('tableRow') ||
        editor.isActive('tableHeader') ||
        editor.isActive('tableCell')
      const nextIsOnImage = enableImages && editor.isActive('image')

      setIsInTable(nextIsInTable)
      if (!nextIsInTable) setShowTableActions(false)
      setIsOnImage(nextIsOnImage)
      if (!nextIsOnImage) setShowAltInput(false)
    }

    updateTableContext()
    editor.on('selectionUpdate', updateTableContext)
    editor.on('transaction', updateTableContext)

    return () => {
      editor.off('selectionUpdate', updateTableContext)
      editor.off('transaction', updateTableContext)
    }
  }, [editor, enableImages])

  useEffect(() => {
    onPendingUploadsChange?.(pendingUploadsRef.current)

    return () => {
      for (const url of objectUrlByUploadIdRef.current.values()) {
        URL.revokeObjectURL(url)
      }
      objectUrlByUploadIdRef.current.clear()
      expectedBlobByUploadIdRef.current.clear()
      pendingUploadsRef.current = 0
      onPendingUploadsChange?.(0)
    }
  }, [onPendingUploadsChange])

  if (!editor) return null

  const updatePendingUploads = (delta: number): void => {
    pendingUploadsRef.current = Math.max(0, pendingUploadsRef.current + delta)
    onPendingUploadsChange?.(pendingUploadsRef.current)
  }

  const createUploadId = (): string =>
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `upload-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

  const fileToDataUrl = (file: File): Promise<string> =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onerror = () => reject(new Error('Failed to read image file.'))
      reader.onload = () => resolve(String(reader.result ?? ''))
      reader.readAsDataURL(file)
    })

  const preloadImageSource = async (
    src: string,
    timeoutMs = UPLOADED_IMAGE_PRELOAD_TIMEOUT_MS,
  ): Promise<boolean> =>
    new Promise<boolean>((resolve) => {
      const image = new window.Image()
      let settled = false
      const timeoutId = window.setTimeout(() => {
        if (settled) return
        settled = true
        image.onload = null
        image.onerror = null
        resolve(false)
      }, timeoutMs)

      const finish = (ok: boolean): void => {
        if (settled) return
        settled = true
        window.clearTimeout(timeoutId)
        image.onload = null
        image.onerror = null
        resolve(ok)
      }

      image.onerror = () => finish(false)
      image.onload = () => {
        if (typeof image.decode === 'function') {
          void image.decode().then(
            () => finish(true),
            // decode errors can still have a usable image after load; keep it non-blocking.
            () => finish(true),
          )
          return
        }
        finish(true)
      }

      image.src = src
      if (image.complete && image.naturalWidth > 0) finish(true)
    })

  const findImageNodeByUploadId = (
    uploadId: string,
  ): { pos: number; attrs: UploadableImageAttrs } | null => {
    let match: { pos: number; attrs: UploadableImageAttrs } | null = null
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name !== 'image') return true
      const attrs = toUploadableAttrs(node.attrs)
      if (attrs.uploadId === uploadId) {
        match = { pos, attrs }
        return false
      }
      return true
    })
    return match
  }

  const finalizeImageUpload = (
    uploadId: string,
    updater: (
      currentAttrs: UploadableImageAttrs,
    ) => UploadableImageAttrs | null,
  ): boolean => {
    const match = findImageNodeByUploadId(uploadId)
    if (!match) return false

    const nextAttrs = updater(match.attrs)
    if (!nextAttrs) return false

    editor.view.dispatch(
      editor.state.tr.setNodeMarkup(match.pos, undefined, nextAttrs),
    )
    return true
  }

  const cleanupUpload = (
    uploadId: string,
    options?: { revokeBlob?: boolean },
  ): void => {
    const shouldRevoke = options?.revokeBlob ?? true
    const objectUrl = objectUrlByUploadIdRef.current.get(uploadId)
    if (shouldRevoke && objectUrl) URL.revokeObjectURL(objectUrl)
    if (shouldRevoke) {
      objectUrlByUploadIdRef.current.delete(uploadId)
    }
    expectedBlobByUploadIdRef.current.delete(uploadId)
    updatePendingUploads(-1)
  }

  const insertLocalImageFile = async (
    file: File,
    source: 'paste' | 'drop' | 'slash',
    initialAttrs?: { alt?: string; title?: string },
  ): Promise<void> => {
    if (!file.type.startsWith('image/')) return
    const uploadId = createUploadId()
    const blobUrl = URL.createObjectURL(file)
    const fallbackAlt = initialAttrs?.alt ?? file.name

    objectUrlByUploadIdRef.current.set(uploadId, blobUrl)
    expectedBlobByUploadIdRef.current.set(uploadId, blobUrl)
    updatePendingUploads(1)

    editor
      .chain()
      .focus()
      .insertContent({
        type: 'image',
        attrs: {
          src: blobUrl,
          alt: fallbackAlt,
          title: initialAttrs?.title,
          uploadId,
          uploading: true,
          uploadError: null,
        },
      })
      .run()

    try {
      let resolved: ImageUploadResult | null = null
      if (onUploadImage) {
        resolved = await onUploadImage(file, { editor, source })
      } else if (imageFallback === 'data-url') {
        if (file.size <= maxImageBytes) {
          resolved = { src: await fileToDataUrl(file), alt: fallbackAlt }
        }
      }

      if (!resolved?.src) {
        finalizeImageUpload(uploadId, (attrs) => ({
          ...attrs,
          uploading: false,
          uploadError: 'Upload failed',
        }))
        cleanupUpload(uploadId, { revokeBlob: false })
        return
      }

      const preloaded = await preloadImageSource(resolved.src)
      if (!preloaded) {
        finalizeImageUpload(uploadId, (attrs) => ({
          ...attrs,
          uploading: false,
          uploadError: 'Image uploaded, but preview failed to load',
        }))
        cleanupUpload(uploadId, { revokeBlob: false })
        return
      }

      finalizeImageUpload(uploadId, (attrs): UploadableImageAttrs | null => {
        const expectedBlob = expectedBlobByUploadIdRef.current.get(uploadId)
        const currentSrc = typeof attrs.src === 'string' ? attrs.src : ''
        if (!expectedBlob || currentSrc !== expectedBlob) return null

        return {
          ...attrs,
          src: resolved.src,
          alt:
            resolved.alt ??
            (typeof attrs.alt === 'string' ? attrs.alt : undefined),
          title:
            resolved.title ??
            (typeof attrs.title === 'string' ? attrs.title : undefined),
          uploading: false,
          uploadError: null,
          uploadId: null,
        }
      })

      cleanupUpload(uploadId, { revokeBlob: true })
    } catch (error) {
      finalizeImageUpload(uploadId, (attrs) => ({
        ...attrs,
        uploading: false,
        uploadError: error instanceof Error ? error.message : 'Upload failed',
      }))
      cleanupUpload(uploadId, { revokeBlob: false })
    }
  }

  const insertImagesFromFiles = async (
    files: File[],
    source: 'paste' | 'drop',
  ): Promise<void> => {
    for (const file of files) {
      await insertLocalImageFile(file, source)
    }
  }

  const setBlockType = (next: BlockType): void => {
    const chain = editor.chain().focus()

    switch (next) {
      case 'paragraph':
        chain.setParagraph().run()
        break
      case 'heading1':
        chain.setHeading({ level: 1 }).run()
        break
      case 'heading2':
        chain.setHeading({ level: 2 }).run()
        break
      case 'heading3':
        chain.setHeading({ level: 3 }).run()
        break
      case 'bulletList':
        chain.toggleBulletList().run()
        break
      case 'orderedList':
        chain.toggleOrderedList().run()
        break
      case 'blockquote':
        chain.toggleBlockquote().run()
        break
      case 'codeBlock':
        chain.toggleCodeBlock().run()
        break
      default:
        break
    }
  }

  const inlineActions: MenuAction[] = [
    {
      label: 'Bold',
      icon: Bold,
      isActive: () => activeState.bold,
      run: () => editor.chain().focus().toggleBold().run(),
      toggle: true,
    },
    {
      label: 'Italic',
      icon: Italic,
      isActive: () => activeState.italic,
      run: () => editor.chain().focus().toggleItalic().run(),
      toggle: true,
    },
    {
      label: 'Underline',
      icon: UnderlineIcon,
      isActive: () => activeState.underline,
      run: () => editor.chain().focus().toggleUnderline().run(),
      toggle: true,
    },
    {
      label: 'Strikethrough',
      icon: Strikethrough,
      isActive: () => activeState.strike,
      run: () => editor.chain().focus().toggleStrike().run(),
      toggle: true,
    },
    {
      label: 'Code',
      icon: Code,
      isActive: () => activeState.code,
      run: () => editor.chain().focus().toggleCode().run(),
      toggle: true,
    },
    {
      label: 'Remove formatting',
      icon: RemoveFormatting,
      run: () => editor.chain().focus().unsetAllMarks().clearNodes().run(),
    },
  ]

  const openLinkInput = () => {
    if (showLinkInput) {
      setShowLinkInput(false)
      return
    }
    const linkAttrs = editor.getAttributes('link')
    const href = typeof linkAttrs['href'] === 'string' ? linkAttrs['href'] : ''
    setLinkUrl(editor.isActive('link') ? href : '')
    setShowLinkInput(true)
    setShowTableActions(false)
    setShowAltInput(false)
  }

  const toggleTableActions = () => {
    if (!isInTable) return
    setShowTableActions((current) => !current)
    setShowLinkInput(false)
    setShowAltInput(false)
  }

  const toggleAltInput = () => {
    if (!enableImages || !isOnImage) return
    if (showAltInput) {
      setShowAltInput(false)
      return
    }
    const imageAttrs = editor.getAttributes('image')
    const alt = imageAttrs['alt']
    setImageAltText(typeof alt === 'string' ? alt : '')
    setShowAltInput(true)
    setShowLinkInput(false)
    setShowTableActions(false)
  }

  const applyLink = () => {
    const trimmed = linkUrl.trim()
    if (!trimmed) return
    editor
      .chain()
      .focus()
      .extendMarkRange('link')
      .setLink({ href: trimmed })
      .run()
    setShowLinkInput(false)
  }

  const removeLink = () => {
    editor.chain().focus().extendMarkRange('link').unsetLink().run()
    setShowLinkInput(false)
    setLinkUrl('')
  }

  const confirmOrRemoveLink = () => {
    const trimmed = linkUrl.trim()
    if (trimmed || editor.isActive('link')) {
      removeLink()
      return
    }

    setShowLinkInput(false)
  }

  const applyImageAlt = () => {
    if (!enableImages || !isOnImage) return
    const trimmed = imageAltText.trim()
    editor
      .chain()
      .focus()
      .updateAttributes('image', {
        alt: trimmed || undefined,
      })
      .run()
    setShowAltInput(false)
  }

  const clearImageAlt = () => {
    if (!enableImages || !isOnImage) return
    editor.chain().focus().updateAttributes('image', {}).run()
    setImageAltText('')
    setShowAltInput(false)
  }

  const addRow = () => editor.chain().focus().addRowAfter().run()
  const removeRow = () => editor.chain().focus().deleteRow().run()
  const addColumn = () => editor.chain().focus().addColumnAfter().run()
  const removeColumn = () => editor.chain().focus().deleteColumn().run()

  const toolbarButtonClass =
    'inline-flex size-7 items-center justify-center rounded-md transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50'
  const toolbarToggleButtonClass = `${toolbarButtonClass} aria-pressed:bg-accent aria-pressed:text-accent-foreground`
  const toolbarInputClass =
    'border-input bg-background text-foreground h-7 rounded-md border px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]'

  const renderIconButton = ({
    label,
    icon: Icon,
    onClick,
    disabled: isDisabled,
    toggle = false,
    pressed = false,
    className: extraClassName,
  }: IconButtonOptions) => (
    <button
      key={label}
      type="button"
      onClick={onClick}
      disabled={isDisabled}
      aria-label={label}
      aria-pressed={toggle ? pressed : undefined}
      className={`${toggle ? toolbarToggleButtonClass : toolbarButtonClass}${extraClassName ? ` ${extraClassName}` : ''}`}
      title={label}
    >
      <Icon className="size-4" />
    </button>
  )
  return (
    <div {...props} className={cn('', className)}>
      <BubbleMenu
        pluginKey="editor-bubble"
        ref={bubbleMenuRef}
        editor={editor}
        className="z-50 w-fit max-w-[95vw] text-popover-foreground outline-hidden"
        options={{
          placement: 'top',
          offset: 10,
          flip: { padding: 8 },
          shift: { padding: 8 },
        }}
        shouldShow={({ editor: bubbleEditor, from, to, view, element }) => {
          const hasEditorFocus =
            view.hasFocus() || element.contains(document.activeElement)
          if (!hasEditorFocus) return false
          return (
            showLinkInput ||
            showTableActions ||
            showAltInput ||
            (!bubbleEditor.state.selection.empty && from !== to)
          )
        }}
      >
        <div className="flex flex-col gap-1">
          <div className="border-border bg-popover flex flex-nowrap items-center gap-0.5 overflow-x-auto rounded-md border p-1 shadow-sm whitespace-nowrap">
            {!isInTable ? (
              <div className="group/native-select relative w-fit">
                <select
                  id="block-style"
                  value={activeState.blockType}
                  onChange={(event) =>
                    setBlockType(event.target.value as BlockType)
                  }
                  disabled={disabled}
                  aria-label="Block style"
                  className="h-7 w-full appearance-none rounded-md border border-transparent bg-transparent px-2 pr-5.5 text-sm shadow-none outline-none hover:bg-accent focus-visible:outline-none focus-visible:ring-0 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {blockOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <ChevronDownIcon
                  className="text-muted-foreground pointer-events-none absolute top-1/2 right-1.5 size-3.5 -translate-y-1/2 opacity-50"
                  aria-hidden="true"
                />
              </div>
            ) : null}
            {inlineActions.map((action) =>
              renderIconButton({
                label: action.label,
                icon: action.icon,
                onClick: action.run,
                disabled,
                toggle: Boolean(action.toggle),
                pressed: action.toggle ? action.isActive() : false,
              }),
            )}
            {renderIconButton({
              label: 'Link',
              icon: LinkIcon,
              onClick: openLinkInput,
              disabled,
              toggle: true,
              pressed: showLinkInput || activeState.link,
            })}
            {isOnImage ? (
              <button
                type="button"
                aria-label="Image alt text"
                title="Image alt text"
                aria-pressed={showAltInput}
                onClick={toggleAltInput}
                disabled={disabled}
                className={`${toolbarToggleButtonClass} size-7 text-xs`}
              >
                ALT
              </button>
            ) : null}
            {isInTable
              ? renderIconButton({
                  label: 'Table',
                  icon: TableIcon,
                  onClick: toggleTableActions,
                  disabled,
                  toggle: true,
                  pressed: showTableActions,
                })
              : null}
          </div>
          {showLinkInput ? (
            <div
              data-state="open"
              className="border-border bg-popover data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:slide-in-from-top-1 flex flex-nowrap items-center gap-0.5 overflow-x-auto rounded-md border p-1 shadow-sm duration-200 whitespace-nowrap"
            >
              <input
                id="link-url"
                ref={linkInputRef}
                type="url"
                placeholder="https://example.com"
                value={linkUrl}
                onChange={(event) => setLinkUrl(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    event.stopPropagation()
                    applyLink()
                  }
                }}
                disabled={disabled}
                className={`${toolbarInputClass} min-w-56 flex-1`}
              />
              {renderIconButton({
                label: 'Set link',
                icon: Check,
                onClick: applyLink,
                disabled: disabled || !linkUrl.trim(),
              })}
              {renderIconButton({
                label: 'Remove link',
                icon: X,
                onClick: confirmOrRemoveLink,
                disabled,
                className: 'ml-auto',
              })}
            </div>
          ) : null}
          {showAltInput && isOnImage ? (
            <div
              data-state="open"
              className="border-border bg-popover data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:slide-in-from-top-1 flex flex-nowrap items-center gap-0.5 overflow-x-auto rounded-md border p-1 shadow-sm duration-200 whitespace-nowrap"
            >
              <input
                id="image-alt"
                type="text"
                placeholder="Describe image"
                value={imageAltText}
                onChange={(event) => setImageAltText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    event.stopPropagation()
                    applyImageAlt()
                  }
                }}
                disabled={disabled}
                className={`${toolbarInputClass} min-w-56 flex-1`}
              />
              {renderIconButton({
                label: 'Save alt text',
                icon: Check,
                onClick: applyImageAlt,
                disabled,
              })}
              {renderIconButton({
                label: 'Remove alt text',
                icon: X,
                onClick: clearImageAlt,
                disabled,
                className: 'ml-auto',
              })}
            </div>
          ) : null}
          {showTableActions && isInTable ? (
            <div
              data-state="open"
              className="border-border bg-popover data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:slide-in-from-top-1 inline-flex w-fit flex-nowrap items-center gap-1 overflow-x-auto self-end rounded-md border p-1 shadow-sm duration-200 whitespace-nowrap"
            >
              <span className="text-sm ml-1 text-muted-foreground">Rows:</span>
              {renderIconButton({
                label: 'Add row',
                icon: Plus,
                onClick: addRow,
                disabled,
              })}
              {renderIconButton({
                label: 'Remove row',
                icon: Minus,
                onClick: removeRow,
                disabled,
              })}
              <span className="bg-border mx-0.5 h-4 w-px" aria-hidden="true" />
              <span className="text-sm text-muted-foreground">Columns:</span>
              {renderIconButton({
                label: 'Add column',
                icon: Plus,
                onClick: addColumn,
                disabled,
              })}
              {renderIconButton({
                label: 'Remove column',
                icon: Minus,
                onClick: removeColumn,
                disabled,
              })}
            </div>
          ) : null}
        </div>
      </BubbleMenu>
      <EditorContent editor={editor} />
    </div>
  )
}
