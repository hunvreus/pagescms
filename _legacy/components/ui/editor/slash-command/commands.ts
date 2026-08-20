import { Extension } from "@tiptap/core";
import Suggestion from "@tiptap/suggestion";
import createSuggestion, {
  type ImagePickerFileResult,
  type ImagePickerHandler,
  type ImagePickerContext,
  type SlashImageFallback,
} from "./suggestion";

type SlashCommandsOptions = {
  onRequestImage: ImagePickerHandler | null;
  onInsertLocalImageFile: ((context: ImagePickerContext & Omit<ImagePickerFileResult, "kind">) => void | Promise<void>) | null;
  enableImages: boolean;
  imageSlashFallback: SlashImageFallback;
};

const SlashCommands = Extension.create<SlashCommandsOptions>({
  name: "slash-commands",

  addOptions() {
    return {
      onRequestImage: null,
      onInsertLocalImageFile: null,
      enableImages: true,
      imageSlashFallback: "prompt-url",
    };
  },

  addProseMirrorPlugins() {
    const suggestion = createSuggestion({
      onRequestImage: this.options.onRequestImage,
      onInsertLocalImageFile: this.options.onInsertLocalImageFile,
      enableImages: this.options.enableImages,
      imageSlashFallback: this.options.imageSlashFallback,
    });

    return [
      Suggestion({
        editor: this.editor,
        char: "/",
        command: ({ editor, range, props }) => {
          props.command({ editor, range });
        },
        ...suggestion,
      }),
    ];
  },
});

export default SlashCommands;
