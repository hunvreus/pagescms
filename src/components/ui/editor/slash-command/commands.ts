import type { I18n } from '@lingui/core'
import { Extension } from '@tiptap/core'
import Suggestion from '@tiptap/suggestion'
import createSuggestion from './suggestion'
import type {
  EditorSnippet,
  ImagePickerFileResult,
  ImagePickerHandler,
  ImagePickerContext,
  SlashImageFallback,
} from './suggestion'

type SlashCommandsOptions = {
  i18n?: I18n
  getSnippets: () => readonly EditorSnippet[]
  onInsertSnippet:
    ((context: ImagePickerContext, snippet: EditorSnippet) => void) | null
  onRequestImage: ImagePickerHandler | null
  onInsertLocalImageFile:
    | ((
        context: ImagePickerContext & Omit<ImagePickerFileResult, 'kind'>,
      ) => void | Promise<void>)
    | null
  enableImages: boolean
  imageSlashFallback: SlashImageFallback
}

const SlashCommands = Extension.create<SlashCommandsOptions>({
  name: 'slash-commands',

  addOptions() {
    return {
      getSnippets: () => [],
      onInsertSnippet: null,
      onRequestImage: null,
      onInsertLocalImageFile: null,
      enableImages: true,
      imageSlashFallback: 'prompt-url',
    }
  },

  addProseMirrorPlugins() {
    const suggestion = createSuggestion({
      i18n: this.options.i18n,
      getSnippets: this.options.getSnippets,
      onInsertSnippet: this.options.onInsertSnippet,
      onRequestImage: this.options.onRequestImage,
      onInsertLocalImageFile: this.options.onInsertLocalImageFile,
      enableImages: this.options.enableImages,
      imageSlashFallback: this.options.imageSlashFallback,
    })

    return [
      Suggestion({
        editor: this.editor,
        char: '/',
        command: ({ editor, range, props }) => {
          props.command({ editor, range })
        },
        ...suggestion,
      }),
    ]
  },
})

export default SlashCommands
