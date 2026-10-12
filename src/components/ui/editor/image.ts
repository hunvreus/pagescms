import { getRenderedAttributes, mergeAttributes } from '@tiptap/core'
import Image from '@tiptap/extension-image'
import Paragraph from '@tiptap/extension-paragraph'
import Link, { isAllowedUri } from '@tiptap/extension-link'
import { DOMSerializer } from '@tiptap/pm/model'
import type { DOMOutputSpec } from '@tiptap/pm/model'
import { NodeSelection } from '@tiptap/pm/state'

export function imageLinkHref(value: unknown): string | null {
  const href = typeof value === 'string' ? value.trim() : ''
  return href && isAllowedUri(href) ? href : null
}

function markdownDestination(value: string) {
  const encoded = encodeURI(value).replace(/%25([0-9A-Fa-f]{2})/g, '%$1')
  return /[()<>]/.test(encoded) ? `<${encoded.replace(/</g, '%3C').replace(/>/g, '%3E')}>` : encoded
}

function linkAttributes(attrs: Record<string, unknown>) {
  const preserved = attrs['linkAttributes']
  const entries = preserved && typeof preserved === 'object'
    ? Object.entries(preserved) : []
  return {
    ...Object.fromEntries(entries.filter(([name]) =>
      !/^on/i.test(name) && !['href', 'title', 'style', 'srcdoc', 'is'].includes(name))),
    href: imageLinkHref(attrs['href']),
    ...(attrs['linkTitle'] ? {title: attrs['linkTitle']} : {}),
  }
}

export const ImageLink = Link.extend({
  parseMarkdown(token, helpers) {
    const href = imageLinkHref(token['href'])
    const image = token.tokens?.length === 1 && token.tokens[0]?.type === 'image'
      ? token.tokens[0] : null
    if (image) return helpers.createNode('image', {
      src: image['href'], alt: image.text, title: image['title'],
      href, linkTitle: token['title'] || null,
    })
    const content = helpers.parseInline(token.tokens || [])
    return href ? helpers.applyMark('link', content, {href, title: token['title'] || null}) : content
  },
})

// The core paragraph parser unwraps bare images, but not linked images.
// Keep standalone linked images at document/block-container level on reload.
export const LinkedImageParagraph = Paragraph.extend({
  parseMarkdown(token, helpers) {
    const link = token.tokens?.length === 1 ? token.tokens[0] : null
    if (link?.type === 'link' && link.tokens?.length === 1 && link.tokens[0]?.type === 'image') {
      return helpers.parseChildren([link])
    }
    return Paragraph.config.parseMarkdown?.(token, helpers) ?? []
  },
})

export const UploadableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      href: {
        default: null, rendered: false,
        parseHTML: (element: HTMLElement) => imageLinkHref(element.closest('a')?.getAttribute('href')),
      },
      linkAttributes: {
        default: {}, rendered: false,
        // HTML input is sanitized before it reaches the schema.
        parseHTML: (element: HTMLElement) => Object.fromEntries(
          Array.from(element.closest('a')?.attributes ?? [])
            .filter(attribute => !['href', 'title'].includes(attribute.name))
            .map(attribute => [attribute.name, attribute.value])),
      },
      linkTitle: {
        default: null, rendered: false,
        parseHTML: (element: HTMLElement) => element.closest('a')?.getAttribute('title') ?? null,
      },
      uploadId: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-upload-id'),
        renderHTML: (attributes: { uploadId?: string | null }) => attributes.uploadId ? { 'data-upload-id': attributes.uploadId } : {},
      },
      uploading: {
        default: false,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-uploading') === 'true',
        renderHTML: (attributes: { uploading?: boolean }) => attributes.uploading ? { 'data-uploading': 'true' } : {},
      },
      uploadError: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-upload-error'),
        renderHTML: (attributes: { uploadError?: string | null }) => attributes.uploadError ? { 'data-upload-error': attributes.uploadError } : {},
      },
    }
  },
  renderHTML({node, HTMLAttributes}) {
    const image = ['img', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes)] as const
    const href = imageLinkHref(node.attrs['href'])
    return href ? ['a', linkAttributes(node.attrs), image] : image
  },
  addNodeView() {
    return ({node, editor, getPos}) => {
      const attributes = getRenderedAttributes(node, editor.extensionManager.attributes)
      const output = this.options.HTMLAttributes
      const image = ['img', mergeAttributes(output, attributes)] as const
      // The editing view is an image, not a live hyperlink. The destination
      // remains on the node and is rendered by the output serializers.
      const {dom} = DOMSerializer.renderSpec(document, image)
      dom.addEventListener('mousedown', () => editor.view.focus())
      // Reassert selection after focus restoration (notably on HTML reload).
      dom.addEventListener('click', event => {
        event.preventDefault()
        const pos = getPos()
        if (typeof pos === 'number') {
          editor.view.focus()
          editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos)))
        }
      })
      return {dom}
    }
  },
  parseMarkdown(token, helpers) {
    return helpers.createNode('image', {src: token['href'], title: token['title'], alt: token.text})
  },
  renderMarkdown(node) {
    const attrs = node.attrs ?? {}
    // Pending uploads must never leak a browser-local URL into saved content.
    if (String(attrs['src'] ?? '').startsWith('blob:')) return ''
    const src = markdownDestination(String(attrs['src'] ?? ''))
    const alt = String(attrs['alt'] ?? '').replace(/\\/g, '\\\\').replace(/(\[|\])/g, '\\$1')
    const quote = (value: unknown) => String(value ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    const image = attrs['title'] ? `![${alt}](${src} "${quote(attrs['title'])}")` : `![${alt}](${src})`
    const href = imageLinkHref(attrs['href'])
    if (!href) return image
    // Markdown links cannot express wrapper classes or configured attributes.
    // Retain those linked images as HTML in mixed Markdown instead.
    if (Object.keys(attrs['linkAttributes'] ?? {}).length) {
      const spec: DOMOutputSpec = ['a', linkAttributes(attrs), ['img', {
        src: attrs['src'], alt: attrs['alt'], ...(attrs['title'] ? {title: attrs['title']} : {}),
      }]]
      const {dom} = DOMSerializer.renderSpec(document, spec)
      return dom.outerHTML
    }
    const title = attrs['linkTitle'] ? ` "${quote(attrs['linkTitle'])}"` : ''
    return `[${image}](${markdownDestination(href)}${title})`
  },
})
