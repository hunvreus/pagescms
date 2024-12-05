import { ReactRenderer } from "@tiptap/react";
import tippy from "tippy.js";
import CommandsList from "./commands-list";
import {
  Code,
  Heading1,
  Heading2,
  Heading3,
  Image,
  List,
  ListOrdered,
  Pilcrow,
  Quote,
  Table
} from "lucide-react";


// TODO: add keywords to make search more flexible?
export default function suggestion(openMediaDialog) {
  return {
    items: ({ query }) => {
      let suggestionsArray = [
        {
          icon: <Pilcrow className="h-4 w-4"/>,
          title: "Text",
          command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setParagraph().run(),
        },
        {
          icon: <Heading1 className="h-4 w-4"/>,
          title: "Heading 1",
          command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setNode("heading", { level: 1 }).run(),
        },
        {
          icon: <Heading2 className="h-4 w-4"/>,
          title: "Heading 2",
          command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setNode("heading", { level: 2 }).run(),
        },
        {
          icon: <Heading3 className="h-4 w-4"/>,
          title: "Heading 3",
          command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setNode("heading", { level: 3 }).run(),
        },
        {
          icon: <List className="h-4 w-4"/>,
          title: "Bullet list",
          command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleBulletList().run(),
        },
        {
          icon: <ListOrdered className="h-4 w-4"/>,
          title: "Numbered list",
          command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
        },
        {
          icon: <Table className="h-4 w-4"/>,
          title: "Table",
          command: ({ editor, range }) => editor.chain().focus().deleteRange(range).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
        },
        {
          icon: <Quote className="h-4 w-4"/>,
          title: "Quote",
          command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setParagraph().toggleBlockquote().run(),
        },
        {
          icon: <Code className="h-4 w-4"/>,
          title: "Code",
          command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
        },
      ];
      
      if (openMediaDialog) suggestionsArray.splice(6, 0, {
        icon: <Image className="h-4 w-4"/>,
        title: "Image",
        command: ({ editor, range }) => {
          // TODO: fix mouse click event (close dialog immediately)
          editor.chain().focus().deleteRange(range).run();
          openMediaDialog();
        },
      });

      return suggestionsArray.filter(item => item.title.toLowerCase().startsWith(query.toLowerCase())).slice(0, 10);
    },

    render: () => {
      let component
      let popup

      return {
        onStart: props => {
          component = new ReactRenderer(CommandsList, {
            props,
            editor: props.editor,
          })

          if (!props.clientRect) {
            return
          }

          popup = tippy("body", {
            getReferenceClientRect: props.clientRect,
            appendTo: () => document.body,
            content: component.element,
            showOnCreate: true,
            interactive: true,
            trigger: "manual",
            placement: "bottom-start",
          })
        },

        onUpdate(props) {
          component.updateProps(props)

          if (!props.clientRect) {
            return
          }

          popup[0].setProps({
            getReferenceClientRect: props.clientRect,
          })
        },

        onKeyDown(props) {
          if (props.event.key === "Escape") {
            popup[0].hide()

            return true
          }

          return component.ref?.onKeyDown(props.event)
        },

        // TODO: potential memory leak here, review this
        onExit() {
          popup[0].destroy()
          component.destroy()
        },
      }
    },
  };
}