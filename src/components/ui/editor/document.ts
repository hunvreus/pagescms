import { DOMSerializer } from '@tiptap/pm/model'
import type { Editor } from '@tiptap/core'

/** Run document normalization before painting, without creating an edit or undo step. */
export function initializeEditorDocument(editor: Editor) {
  editor.view.dispatch(
    editor.state.tr
      .setMeta('preventUpdate', true)
      .setMeta('addToHistory', false),
  )
}

/** Serialize in an inactive document so image references cannot initiate downloads. */
export function serializeEditorHtml(editor: Editor) {
  const inert = document.implementation.createHTMLDocument()
  const container = inert.createElement('div')
  container.appendChild(
    DOMSerializer.fromSchema(editor.schema).serializeFragment(
      editor.state.doc.content,
      { document: inert },
    ),
  )
  return container.innerHTML
}
