import DOMPurify from 'dompurify'
import {
  Node as TiptapNode,
  Mark as TiptapMark,
  generateJSON,
} from '@tiptap/core'
import type { JSONContent, Editor } from '@tiptap/core'
import { Lexer, Marked, marked } from 'marked'
import { NodeSelection, TextSelection } from '@tiptap/pm/state'
import type { EditorView, ViewMutationRecord } from '@tiptap/pm/view'
import { DOMSerializer, Slice } from '@tiptap/pm/model'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'

export type MarkdownHtmlPolicy = {
  keep?: string[]
  strip?: string[]
  drop?: string[]
  /** Additional attributes to preserve. Unsafe attributes and URLs remain forbidden. */
  attributes?: string[]
}

// A native selectionchange can arrive after the first keypress. Commit a click
// in text immediately when the previous selection was an atomic source item.
export function selectClickedText(view: EditorView, event: MouseEvent) {
  if (!(view.state.selection instanceof NodeSelection)) return false
  if (
    event.target instanceof Element &&
    event.target.closest('[contenteditable="false"]')
  )
    return false
  const selection = view.dom.ownerDocument.getSelection()
  const anchor = selection?.anchorNode
  if (
    !selection?.isCollapsed ||
    !anchor ||
    anchor.nodeType !== 3 ||
    !view.dom.contains(anchor)
  )
    return false
  const position = view.posAtDOM(anchor, selection.anchorOffset)
  if (!view.state.doc.resolve(position).parent.inlineContent) return false
  view.dispatch(
    view.state.tr.setSelection(TextSelection.create(view.state.doc, position)),
  )
  return true
}

export function createMarkdownParser() {
  const parser = new Marked()
  // Tiptap types this option as the global callable marked export, but its
  // manager uses the same lexer/use/parse methods supplied by a Marked instance.
  return Object.assign(parser, {
    getDefaults: marked.getDefaults,
  }) as unknown as typeof marked
}
const htmlMarkdown = createMarkdownParser()

const containers = ['div', 'section', 'article', 'aside', 'details', 'summary']
const safeAttributes = [
  'class',
  'id',
  'href',
  'src',
  'alt',
  'title',
  'width',
  'height',
  'colspan',
  'rowspan',
  'start',
  'open',
]
const forbiddenTags = [
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'form',
  'input',
  'button',
  'textarea',
  'select',
  'meta',
  'link',
  'base',
  'svg',
  'math',
  'template',
]

function matches(element: Element, selectors: string[] = []) {
  return selectors.some((selector) => {
    try {
      return element.matches(selector)
    } catch {
      return false
    }
  })
}

function action(element: Element, policy?: MarkdownHtmlPolicy) {
  if (matches(element, policy?.drop)) return 'drop'
  if (matches(element, policy?.strip)) return 'strip'
  if (matches(element, policy?.keep)) return 'keep'
  return null
}

/** Apply selectors to the original tree, then sanitize every retained descendant. */
export function sanitizeEditorHtml(html: string, policy?: MarkdownHtmlPolicy) {
  if (typeof document === 'undefined') return ''
  const template = document.createElement('template')
  // Sanitization comes before selectors as well as after them, so forbidden elements
  // cannot be converted into visible text or recovered through a keep rule.
  template.innerHTML = DOMPurify.sanitize(html, {
    FORBID_TAGS: forbiddenTags,
    FORBID_ATTR: ['style', 'srcdoc', 'is'],
    ADD_ATTR: policy?.attributes ?? [],
  })
  const decisions = new Map(
    Array.from(template.content.querySelectorAll('*')).map((element) => [
      element,
      action(element, policy),
    ]),
  )
  const visit = (element: Element) => {
    const decision = decisions.get(element)
    if (decision === 'drop') {
      element.remove()
      return
    }
    for (const child of Array.from(element.children)) visit(child)
    if (decision === 'strip') {
      element.replaceWith(document.createTextNode(element.textContent))
      return
    }
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase()
      if (
        !safeAttributes.includes(name) &&
        !policy?.attributes?.includes(name)
      ) {
        element.removeAttribute(attribute.name)
      }
      // Internal source-node metadata must never be accepted from pasted HTML.
      if (
        name.startsWith('on') ||
        name === 'style' ||
        name.startsWith('data-editor-')
      ) {
        element.removeAttribute(attribute.name)
      }
    }
  }
  for (const element of Array.from(template.content.children)) visit(element)
  return DOMPurify.sanitize(template.innerHTML, {
    FORBID_TAGS: forbiddenTags,
    FORBID_ATTR: ['style', 'srcdoc', 'is'],
    ADD_ATTR: policy?.attributes ?? [],
  })
}

/** Close kept clipboard nodes; plain-text pastes have no kept nodes and use normal handling. */
export function pasteKeptHtml(view: EditorView, slice: Slice) {
  const kept: ProseMirrorNode[] = []
  slice.content.descendants((node) => {
    if (
      node.type.name.startsWith('htmlContainer_') ||
      node.type.name.startsWith('keptHtml') ||
      node.marks.some((mark) => mark.type.name === 'htmlSpan')
    )
      kept.push(node)
  })
  if (kept.length === 0) return false
  // transformPastedHTML already sanitized and applied selectors to the original tree.
  view.dispatch(
    view.state.tr
      .replaceSelection(new Slice(slice.content, 0, 0))
      .scrollIntoView()
      .setMeta('paste', true)
      .setMeta('uiEvent', 'paste'),
  )
  return true
}

// Stored fragments have already passed selector rules. Reapply only the safety
// boundary when rendering/exporting; positional rules must not run repeatedly.
function sanitizeStoredHtml(html: string, policy?: MarkdownHtmlPolicy) {
  return sanitizeEditorHtml(
    html,
    policy?.attributes ? { attributes: policy.attributes } : undefined,
  )
}

const omitted = (block: boolean): JSONContent => ({
  type: block ? 'omittedHtmlBlock' : 'omittedHtmlInline',
})
const sourceNode = (source: string, block: boolean): JSONContent => ({
  type: block ? 'htmlSourceBlock' : 'htmlSourceInline',
  attrs: { source },
})

function sourceMarkdown(source: string, block: boolean) {
  // Opaque components remain source. If edited source includes browser-executable
  // HTML, export it as code rather than letting the source node bypass the policy.
  const template = document.createElement('template')
  template.innerHTML = source
  const purifier = DOMPurify(window)
  const unsafe = Array.from(template.content.querySelectorAll('*')).some(
    (element) =>
      forbiddenTags.includes(element.tagName.toLowerCase()) ||
      Array.from(element.attributes).some((attribute) => {
        const name = attribute.name.toLowerCase()
        return (
          name.startsWith('on') ||
          ['style', 'srcdoc', 'is'].includes(name) ||
          ([
            'href',
            'src',
            'xlink:href',
            'action',
            'formaction',
            'poster',
            'background',
          ].includes(name) &&
            !purifier.isValidAttribute(
              element.tagName.toLowerCase(),
              name,
              attribute.value,
            ))
        )
      }),
  )
  if (!unsafe) return source
  const runs = source.match(/`+/g) ?? []
  const delimiter = '`'.repeat(
    Math.max(block ? 2 : 0, ...runs.map((run) => run.length)) + 1,
  )
  return block
    ? `${delimiter}html\n${source}\n${delimiter}`
    : `${delimiter} ${source.replace(/\n/g, ' ')} ${delimiter}`
}

function serializeNode(editor: Editor, node: JSONContent) {
  const dom = DOMSerializer.fromSchema(editor.schema).serializeNode(
    editor.schema.nodeFromJSON(node),
  )
  const template = document.createElement('template')
  template.content.append(dom)
  return template.innerHTML
}

// Use Marked's HTML tokens, including its handling of quoted attributes and code,
// rather than matching closing tags with a regular expression.
function htmlFragment(src: string) {
  if (!src.startsWith('<')) return undefined
  const tokens = new Lexer(htmlMarkdown.defaults).inlineTokens(src)
  const first = tokens.at(0)
  if (!first || first.type !== 'html') return undefined
  const opening = first.raw.match(/^<([\w-]+)(?:\s|\/?>)/)
  if (!opening || first.raw.endsWith('/>') || /^<!--/.test(first.raw))
    return first.raw
  const tag = opening.at(1)?.toLowerCase()
  if (['br', 'hr', 'img', 'input', 'meta', 'link', 'wbr'].includes(tag ?? ''))
    return first.raw
  let depth = 0
  let raw = ''
  for (const token of tokens) {
    raw += token.raw
    if (token.type !== 'html') continue
    const name = token.raw.match(/^<(\/?)([\w-]+)(?:\s|\/?>)/)
    if (name?.at(2)?.toLowerCase() !== tag) continue
    depth += name?.at(1) ? -1 : token.raw.endsWith('/>') ? 0 : 1
    if (depth === 0) return raw
  }
  return first.raw
}

function expandMarkdownHtml(html: string, policy?: MarkdownHtmlPolicy) {
  const parser = new Marked()
  const expand = (fragment: string): string => {
    const raw = htmlFragment(fragment)
    if (!raw) return fragment
    const parts = new Lexer(htmlMarkdown.defaults).inlineTokens(raw)
    const opening = parts.at(0)
    const closing = parts.at(-1)
    if (!opening) return fragment
    const name = opening.raw
      .match(/^<([\w-]+)(?:\s|>)/)
      ?.at(1)
      ?.toLowerCase()
    if (
      !name ||
      ![...containers, 'span'].includes(name) ||
      closing?.type !== 'html' ||
      !closing.raw.toLowerCase().startsWith(`</${name}`)
    )
      return fragment
    const template = document.createElement('template')
    template.innerHTML = opening.raw
    const root = template.content.firstElementChild
    if (!root || action(root, policy) !== 'keep') return fragment
    const inner = raw.slice(opening.raw.length, -closing.raw.length)
    // Parse the original source once. DOM innerHTML would escape blockquote/code
    // characters and parsing it repeatedly would reinterpret escaped Markdown.
    const content =
      name === 'span' || name === 'summary'
        ? parser.parseInline(inner, { async: false })
        : parser.parse(inner, { async: false })
    return opening.raw + content + closing.raw + fragment.slice(raw.length)
  }
  parser.use({ renderer: { html: (token) => expand(token.text) } })
  return expand(html)
}

export function createMarkdownHtmlExtensions(policy?: MarkdownHtmlPolicy) {
  let currentEditor: Editor
  const nodes: ReturnType<typeof TiptapNode.create>[] = containers.map((tag) =>
    TiptapNode.create({
      name: `htmlContainer_${tag}`,
      group: 'block',
      content: tag === 'summary' ? 'inline*' : 'block*',
      defining: true,
      addAttributes() {
        return {
          attributes: {
            default: {},
            parseHTML: (element) =>
              Object.fromEntries(
                Array.from(element.attributes)
                  .filter(
                    (attribute) =>
                      safeAttributes.includes(attribute.name) ||
                      policy?.attributes?.includes(attribute.name),
                  )
                  .map((attribute) => [attribute.name, attribute.value]),
              ),
            renderHTML: (attrs) =>
              attrs['attributes'] as Record<string, string>,
          },
        }
      },
      parseHTML() {
        return [
          {
            tag,
            getAttrs: (element) =>
              action(element, policy) === 'keep' ? {} : false,
          },
        ]
      },
      renderHTML({ HTMLAttributes }) {
        return [tag, HTMLAttributes, 0]
      },
      ...(tag === 'details'
        ? {
            addNodeView() {
              return ({ node }: { node: ProseMirrorNode }) => {
                const dom = document.createElement('details')
                for (const [name, value] of Object.entries(
                  node.attrs['attributes'] ?? {},
                ))
                  dom.setAttribute(name, String(value))
                // Keep descendants accessible for editing without changing saved open state.
                dom.open = true
                dom.addEventListener('toggle', () => {
                  if (!dom.open) dom.open = true
                })
                return {
                  dom,
                  contentDOM: dom,
                  ignoreMutation: (mutation: ViewMutationRecord) =>
                    mutation.type === 'attributes' &&
                    mutation.target === dom &&
                    mutation.attributeName === 'open',
                }
              }
            },
          }
        : {}),
      renderMarkdown(node) {
        return serializeNode(currentEditor, node)
      },
    }),
  )

  for (const block of [false, true]) {
    nodes.push(
      TiptapNode.create({
        name: block ? 'omittedHtmlBlock' : 'omittedHtmlInline',
        group: block ? 'block' : 'inline',
        inline: !block,
        atom: true,
        selectable: false,
        renderHTML() {
          return [block ? 'div' : 'span', { hidden: '' }]
        },
        renderMarkdown() {
          return ''
        },
      }),
    )
    nodes.push(
      TiptapNode.create({
        name: block ? 'htmlSourceBlock' : 'htmlSourceInline',
        group: block ? 'block' : 'inline',
        inline: !block,
        atom: true,
        addAttributes() {
          return { source: { default: '', rendered: false } }
        },
        // Source is text in HTML output; it must not become executable markup.
        renderHTML({ node }) {
          return [block ? 'pre' : 'code', {}, node.attrs['source'] as string]
        },
        renderMarkdown(node) {
          return sourceMarkdown(String(node.attrs?.['source'] ?? ''), block)
        },
        addNodeView() {
          return ({ node, getPos, editor }) => {
            const dom = document.createElement(block ? 'pre' : 'code')
            dom.dataset['editorHtmlSource'] = ''
            dom.textContent = String(node.attrs['source'] ?? '')
            dom.title = 'Double-click to edit source'
            dom.contentEditable = 'false'
            dom.addEventListener('dblclick', () => {
              if (!editor.isEditable) return
              const source = window.prompt(
                'Edit source',
                String(node.attrs['source'] ?? ''),
              )
              const pos = getPos()
              if (source !== null && typeof pos === 'number') {
                editor.view.dispatch(
                  editor.state.tr.setNodeMarkup(pos, undefined, { source }),
                )
              }
            })
            return { dom }
          }
        },
      }),
    )
  }

  const inlineTags = [
    'a',
    'strong',
    'b',
    'em',
    'i',
    'u',
    's',
    'del',
    'code',
    'img',
    'br',
    'span',
    'abbr',
    'cite',
    'q',
    'time',
    'small',
    'sub',
    'sup',
    'kbd',
    'mark',
    'label',
  ]
  const rawDom = (source: string, block: boolean) => {
    const template = document.createElement('template')
    template.innerHTML = sanitizeStoredHtml(source, policy)
    if (
      template.content.childNodes.length === 1 &&
      template.content.firstElementChild
    )
      return template.content.firstElementChild
    const wrapper = document.createElement(block ? 'div' : 'span')
    wrapper.appendChild(template.content)
    return wrapper
  }
  for (const block of [false, true]) {
    nodes.push(
      TiptapNode.create({
        name: block ? 'keptHtmlBlock' : 'keptHtmlInline',
        group: block ? 'block' : 'inline',
        inline: !block,
        atom: true,
        priority: 50,
        addAttributes() {
          return { source: { default: '', rendered: false } }
        },
        parseHTML() {
          return [
            {
              tag: '*',
              priority: 2000,
              getAttrs: (element) => {
                const tag = element.tagName.toLowerCase()
                const nestedSpan =
                  tag === 'span' &&
                  Array.from(element.querySelectorAll('span')).some(
                    (child) => action(child, policy) === 'keep',
                  )
                if (
                  containers.includes(tag) ||
                  (tag === 'span' && !nestedSpan) ||
                  inlineTags.includes(tag) === block ||
                  action(element, policy) !== 'keep'
                )
                  return false
                return {
                  source: sanitizeStoredHtml(element.outerHTML, policy),
                }
              },
            },
          ]
        },
        renderHTML({ node }) {
          return rawDom(String(node.attrs['source'] ?? ''), block)
        },
        renderMarkdown(node) {
          return sanitizeStoredHtml(
            String(node.attrs?.['source'] ?? ''),
            policy,
          )
        },
        addNodeView() {
          return ({ node, editor, getPos }) => {
            const dom = rawDom(
              String(node.attrs['source'] ?? ''),
              block,
            ) as HTMLElement
            dom.contentEditable = 'false'
            dom.title = 'Double-click to edit HTML'
            dom.addEventListener('dblclick', () => {
              if (!editor.isEditable) return
              const source = window.prompt(
                'Edit HTML',
                String(node.attrs['source'] ?? ''),
              )
              const pos = getPos()
              if (source !== null && typeof pos === 'number')
                editor.view.dispatch(
                  editor.state.tr.setNodeMarkup(pos, undefined, {
                    source: sanitizeEditorHtml(source, policy),
                  }),
                )
            })
            return { dom }
          }
        },
      }),
    )
  }

  nodes.push(
    TiptapNode.create({
      name: 'markdownHtmlPolicy',
      priority: 110,
      onBeforeCreate() {
        currentEditor = this.editor
      },
      group: 'block',
      atom: true,
      renderHTML() {
        return ['div', { hidden: '' }]
      },
      markdownTokenName: 'html',
      markdownTokenizer: {
        name: 'htmlPolicyBlock',
        level: 'block',
        start: (src) => {
          const match = /(?:^|\n)</.exec(src)
          return match ? match.index + (match[0].startsWith('\n') ? 1 : 0) : -1
        },
        tokenize: (src) => {
          const raw = htmlFragment(src)
          return raw && /^(?:[ \t]*\n|[ \t]*$)/.test(src.slice(raw.length))
            ? { type: 'html', raw, text: raw, block: true }
            : undefined
        },
      },
      parseMarkdown(token) {
        const block = Boolean(token['block'])
        const html = String(token.raw ?? token.text ?? '')
        const original = document.createElement('template')
        original.innerHTML = html
        const root = original.content.firstElementChild
        const decision = root ? action(root, policy) : null
        if (decision === 'drop') return omitted(block)
        if (decision === 'strip') {
          const text = document.createElement('template')
          text.innerHTML = sanitizeEditorHtml(html, policy)
          const value = text.content.textContent
          if (!value) return omitted(block)
          return block
            ? { type: 'paragraph', content: [{ type: 'text', text: value }] }
            : { type: 'text', text: value }
        }
        // Unsupported syntax anywhere in a fragment must not disappear inside
        // an otherwise editable wrapper. Keep that fragment as visible source.
        const opaque = new Lexer(htmlMarkdown.defaults)
          .inlineTokens(html)
          .some((part) => {
            if (part.type !== 'html') return false
            if (part.raw.startsWith('<!--')) return true
            const component = part.raw.match(/^<([A-Z][\w.-]*)(?:\s|\/?>)/)
            return Boolean(
              component?.[1] && component[1] !== component[1].toUpperCase(),
            )
          })
        if (opaque) return sourceNode(html, block)
        const safe = sanitizeEditorHtml(
          expandMarkdownHtml(html, policy),
          policy,
        )
        if (!safe.trim()) return omitted(block)
        const parsed = generateJSON(
          safe,
          currentEditor.extensionManager.extensions,
        ) as JSONContent
        if (block)
          return parsed.content?.length ? parsed.content : omitted(true)
        const inline =
          parsed.content?.flatMap((node) =>
            node.type === 'paragraph' ? (node.content ?? []) : [node],
          ) ?? []
        if (
          inline.some(
            (node) =>
              !new Map(Object.entries(currentEditor.schema.nodes)).get(
                node.type ?? '',
              )?.isInline,
          )
        )
          return sourceNode(html, false)
        return inline.length ? inline : omitted(false)
      },
    }),
  )
  // Inline HTML must use a custom token: Tiptap's built-in inline HTML path
  // bypasses parseMarkdown hooks and would otherwise bypass our filtering.
  const blockHandler = nodes.at(-1)
  if (!blockHandler) throw new Error('Missing HTML policy handler')
  nodes.push(
    blockHandler.extend({
      name: 'markdownHtmlPolicyInline',
      markdownTokenName: 'htmlPolicyInline',
      markdownTokenizer: {
        name: 'htmlPolicyInline',
        level: 'inline',
        start: '<',
        tokenize: (src) => {
          const raw = htmlFragment(src)
          return raw
            ? { type: 'htmlPolicyInline', raw, text: raw, block: false }
            : undefined
        },
      },
    }),
  )
  const span = TiptapMark.create({
    name: 'htmlSpan',
    addAttributes() {
      return {
        attributes: {
          default: {},
          parseHTML: (element) =>
            Object.fromEntries(
              Array.from(element.attributes)
                .filter(
                  (attribute) =>
                    safeAttributes.includes(attribute.name) ||
                    policy?.attributes?.includes(attribute.name),
                )
                .map((attribute) => [attribute.name, attribute.value]),
            ),
          renderHTML: (attrs) => attrs['attributes'] as Record<string, string>,
        },
      }
    },
    parseHTML() {
      return [
        {
          tag: 'span',
          getAttrs: (element) =>
            action(element, policy) === 'keep' ? {} : false,
        },
      ]
    },
    renderHTML({ HTMLAttributes }) {
      return ['span', HTMLAttributes, 0]
    },
    renderMarkdown(node, helpers) {
      const element = document.createElement('span')
      for (const [name, value] of Object.entries(
        node.attrs?.['attributes'] ?? {},
      ))
        element.setAttribute(name, String(value))
      return element.outerHTML.replace(
        '</span>',
        helpers.renderChildren(node) + '</span>',
      )
    },
  })
  return [...nodes, span]
}
