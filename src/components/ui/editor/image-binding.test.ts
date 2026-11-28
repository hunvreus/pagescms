// @vitest-environment jsdom
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from '@tiptap/markdown'
import { expect, it, vi } from 'vitest'
import { UploadableImage } from './image'

it('displays renewable URLs without mutating saved HTML/Markdown or dirty state', async () => {
  const stable = '/api/media-preview/o/r/main/images/images/a.png'
  let image: HTMLImageElement | undefined
  const stop = vi.fn()
  const updates = vi.fn()
  const bind = vi.fn((element: HTMLImageElement) => {
    image = element
    element.src = 'https://raw.example/a?token=1'
    return stop
  })
  const element = document.createElement('div')
  document.body.appendChild(element)
  const editor = new Editor({
    element,
    extensions: [
      StarterKit,
      UploadableImage.configure({ bindImage: bind }),
      Markdown,
    ],
    content: `<p><img src="${stable}" alt="A"></p>`,
    onUpdate: updates,
  })
  const original = editor.getHTML()
  expect(image?.src).toContain('token=1')
  for (let index = 2; index <= 10; index++)
    image!.src = `https://raw.example/a?token=${index}`
  await new Promise((resolve) => setTimeout(resolve, 20))
  expect(editor.getHTML()).toBe(original)
  expect(editor.getHTML()).toContain(stable)
  expect(editor.getMarkdown()).toContain(stable)
  expect(editor.getMarkdown()).not.toContain('token=')
  expect(updates).not.toHaveBeenCalled()
  editor.view.setProps({ nodeViews: {} })
  expect(editor.view.dom.querySelector('img')?.getAttribute('src')).toBeNull()
  expect(editor.getHTML()).toBe(original)
  editor.destroy()
  expect(stop).toHaveBeenCalledOnce()
  element.remove()
})
