import type { I18n } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import { ReactRenderer } from '@tiptap/react'
import type { Editor } from '@tiptap/core'
import tippy from 'tippy.js'
import type { Instance as TippyInstance } from 'tippy.js'
import CommandsList from './commands-list'
import type {
  CommandsListHandle,
  CommandsListProps,
  SlashItem,
} from './commands-list'
import Code from '@hugeicons/core-free-icons/CodeIcon'
import FileText from '@hugeicons/core-free-icons/FileTextIcon'
import Heading1 from '@hugeicons/core-free-icons/Heading01Icon'
import Heading2 from '@hugeicons/core-free-icons/Heading02Icon'
import Heading3 from '@hugeicons/core-free-icons/Heading03Icon'
import Image from '@hugeicons/core-free-icons/Image01Icon'
import List from '@hugeicons/core-free-icons/ListIcon'
import ListOrdered from '@hugeicons/core-free-icons/ListOrderedIcon'
import Pilcrow from '@hugeicons/core-free-icons/PilcrowIcon'
import Quote from '@hugeicons/core-free-icons/QuoteIcon'
import Table from '@hugeicons/core-free-icons/TableIcon'
import type { SuggestionOptions as TiptapSuggestionOptions } from '@tiptap/suggestion'

export type ImagePickerUrlResult = {
  kind: 'url'
  src: string
  alt?: string
  title?: string
}

export type ImagePickerFileResult = {
  kind: 'file'
  file: File
  alt?: string
  title?: string
}

export type ImagePickerResult = ImagePickerUrlResult | ImagePickerFileResult

export type ImagePickerContext = {
  editor: Editor
  range: { from: number; to: number }
}

export type ImagePickerHandler = (
  context: ImagePickerContext,
) => ImagePickerResult | null | Promise<ImagePickerResult | null>

export type SlashImageFallback = 'prompt-url' | 'none'

export type EditorSnippet = {
  label: string
  source: string
  format?: 'html' | 'markdown'
}

type SuggestionOptions = {
  i18n?: I18n
  getSnippets?: () => readonly EditorSnippet[]
  onInsertSnippet?:
    ((context: ImagePickerContext, snippet: EditorSnippet) => void) | null
  onRequestImage?: ImagePickerHandler | null
  onInsertLocalImageFile?:
    | ((
        context: ImagePickerContext & Omit<ImagePickerFileResult, 'kind'>,
      ) => void | Promise<void>)
    | null
  enableImages?: boolean
  imageSlashFallback?: SlashImageFallback
}

const TABLE_SAFE_COMMANDS = new Set(['Image'])

type RequestImageAndInsertArgs = ImagePickerContext & {
  i18n?: I18n
  onRequestImage: ImagePickerHandler | null
  onInsertLocalImageFile:
    | ((
        context: ImagePickerContext & Omit<ImagePickerFileResult, 'kind'>,
      ) => void | Promise<void>)
    | null
  imageSlashFallback: SlashImageFallback
}

const requestImageAndInsert = async ({
  editor,
  range,
  onRequestImage,
  i18n,
  onInsertLocalImageFile,
  imageSlashFallback = 'prompt-url',
}: RequestImageAndInsertArgs): Promise<void> => {
  let result: ImagePickerResult | null = null
  if (onRequestImage) {
    result = await onRequestImage({ editor, range })
  } else if (imageSlashFallback === 'prompt-url') {
    const src = window
      .prompt(i18n ? i18n._(msg({ message: 'Image URL' })) : 'Image URL')
      ?.trim()
    result = src ? { kind: 'url', src } : null
  }

  if (!result) return

  if (result.kind === 'file') {
    if (!onInsertLocalImageFile) return
    editor.chain().focus().deleteRange(range).run()
    const fileInsertContext: ImagePickerContext &
      Omit<ImagePickerFileResult, 'kind'> = {
      editor,
      range,
      file: result.file,
      ...(result.alt ? { alt: result.alt } : {}),
      ...(result.title ? { title: result.title } : {}),
    }
    await onInsertLocalImageFile(fileInsertContext)
    return
  }

  const imageAttrs = {
    src: result.src,
    ...(result.alt ? { alt: result.alt } : {}),
    ...(result.title ? { title: result.title } : {}),
  }

  editor.chain().focus().deleteRange(range).setImage(imageAttrs).run()
}

const getAllItems = (options: SuggestionOptions): SlashItem[] => [
  {
    title: 'Text',
    label: msg({ message: 'Text' }),
    icon: Pilcrow,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setParagraph().run(),
  },
  {
    title: 'Heading 1',
    label: msg({ message: 'Heading 1' }),
    icon: Heading1,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setHeading({ level: 1 }).run(),
  },
  {
    title: 'Heading 2',
    label: msg({ message: 'Heading 2' }),
    icon: Heading2,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setHeading({ level: 2 }).run(),
  },
  {
    title: 'Heading 3',
    label: msg({ message: 'Heading 3' }),
    icon: Heading3,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setHeading({ level: 3 }).run(),
  },
  {
    title: 'Bulleted list',
    label: msg({ message: 'Bulleted list' }),
    icon: List,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleBulletList().run(),
  },
  {
    title: 'Numbered list',
    label: msg({ message: 'Numbered list' }),
    icon: ListOrdered,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
  },
  {
    title: 'Image',
    label: msg({ message: 'Image' }),
    icon: Image,
    command: ({ editor, range }) => {
      void requestImageAndInsert({
        editor,
        range,
        i18n: options.i18n,
        onRequestImage: options.onRequestImage ?? null,
        onInsertLocalImageFile: options.onInsertLocalImageFile ?? null,
        imageSlashFallback: options.imageSlashFallback ?? 'prompt-url',
      })
    },
  },
  {
    title: 'Table',
    label: msg({ message: 'Table' }),
    icon: Table,
    command: ({ editor, range }) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run(),
  },
  {
    title: 'Quote',
    label: msg({ message: 'Quote' }),
    icon: Quote,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
  },
  {
    title: 'Code block',
    label: msg({ message: 'Code block' }),
    icon: Code,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
  },
]

type SlashSuggestion = Pick<TiptapSuggestionOptions, 'items' | 'render'>
type SuggestionRenderLifecycle = NonNullable<
  ReturnType<NonNullable<SlashSuggestion['render']>>
>
type SuggestionKeyDownProps = Parameters<
  NonNullable<SuggestionRenderLifecycle['onKeyDown']>
>[0]

const createSuggestion = (
  options: SuggestionOptions = {},
): SlashSuggestion => ({
  items: ({ query, editor }: { query: string; editor: Editor }) => {
    const isInTableCell =
      editor.isActive('tableCell') || editor.isActive('tableHeader')
    const snippets: SlashItem[] = (options.getSnippets?.() ?? []).map(
      (snippet) => ({
        title: snippet.label,
        icon: FileText,
        command: (context) => options.onInsertSnippet?.(context, snippet),
      }),
    )
    const commands = getAllItems(options)
      .filter((item) => !isInTableCell || TABLE_SAFE_COMMANDS.has(item.title))
      .filter(
        (item) => options.enableImages !== false || item.title !== 'Image',
      )
    return [...commands, ...(!isInTableCell ? snippets : [])].filter((item) =>
      (item.label && options.i18n ? options.i18n._(item.label) : item.title)
        .toLowerCase()
        .includes(query.toLowerCase()),
    )
  },

  render: (): SuggestionRenderLifecycle => {
    let component: ReactRenderer<CommandsListHandle, CommandsListProps> | null =
      null
    let popup: TippyInstance | null = null

    return {
      onStart: (props) => {
        component = new ReactRenderer(CommandsList, {
          props,
          editor: props.editor,
        })

        if (!props.clientRect) return
        const referenceRect = () =>
          props.clientRect?.() ?? new DOMRect(0, 0, 0, 0)

        popup = tippy(document.body, {
          getReferenceClientRect: referenceRect,
          appendTo: () => document.body,
          content: component.element,
          showOnCreate: true,
          interactive: true,
          trigger: 'manual',
          placement: 'bottom-start',
        })
      },

      onUpdate: (props) => {
        if (!component) return
        component.updateProps(
          props.loading ? { ...props, items: component.props.items } : props,
        )
        if (!props.clientRect || !popup) return
        const referenceRect = () =>
          props.clientRect?.() ?? new DOMRect(0, 0, 0, 0)
        popup.setProps({ getReferenceClientRect: referenceRect })
      },

      onKeyDown: ({ event }: SuggestionKeyDownProps): boolean => {
        if (event.key === 'Escape' && popup) {
          popup.hide()
          return true
        }

        return component?.ref?.onKeyDown(event) ?? false
      },

      onExit: (): void => {
        if (popup) popup.destroy()
        component?.destroy()
      },
    }
  },
})

export default createSuggestion
