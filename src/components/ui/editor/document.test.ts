// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import { Table } from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableHeader from '@tiptap/extension-table-header'
import TableCell from '@tiptap/extension-table-cell'
import { initializeEditorDocument } from './document'

const editors: Editor[] = []
afterEach(() => {
  editors.forEach((editor) => editor.destroy())
  editors.length = 0
})
function create(content: string) {
  const onUpdate = vi.fn()
  const editor = new Editor({
    extensions: [StarterKit, Image, Table, TableRow, TableHeader, TableCell],
    content,
    onMount: ({ editor: mountedEditor }) =>
      initializeEditorDocument(mountedEditor),
    onUpdate,
  })
  editors.push(editor)
  return { editor, onUpdate }
}

it.each([
  '<ul><li><p>Last list item</p></li></ul>',
  '<h2>Last heading</h2>',
  '<img src="/test.png" alt="Last image">',
  '<table><tbody><tr><td><p>Last cell</p></td></tr></tbody></table>',
])(
  'initializes the end of %s before the first focus transaction',
  (content) => {
    const { editor, onUpdate } = create(content)
    const html = editor.getHTML()
    expect(html).toMatch(/<p><\/p>$/)
    expect(editor.state.doc.lastChild?.content.size).toBe(0)
    expect(editor.commands.undo()).toBe(false)
    editor.commands.setTextSelection(1)
    editor.view.dispatch(
      editor.state.tr.setMeta('focus', { event: new FocusEvent('focus') }),
    )
    editor.view.dispatch(
      editor.state.tr.setMeta('blur', { event: new FocusEvent('blur') }),
    )
    expect(editor.getHTML()).toBe(html)
    expect(onUpdate).not.toHaveBeenCalled()
  },
)

it('does not add an extra paragraph when the document already ends with one', () => {
  const { editor, onUpdate } = create('<p>Existing paragraph</p>')
  expect(editor.getHTML()).toBe('<p>Existing paragraph</p>')
  expect(onUpdate).not.toHaveBeenCalled()
})

it('retains the ability to type after a terminal block and undo only that edit', () => {
  const { editor, onUpdate } = create('<ul><li><p>Last item</p></li></ul>')
  const initial = editor.getHTML()
  editor.commands.insertContentAt(
    editor.state.doc.content.size - 1,
    'Text after the list',
  )
  expect(editor.getHTML()).toContain('<p>Text after the list</p>')
  expect(onUpdate).toHaveBeenCalledOnce()
  expect(editor.commands.undo()).toBe(true)
  expect(editor.getHTML()).toBe(initial)
  expect(editor.commands.undo()).toBe(false)
})
