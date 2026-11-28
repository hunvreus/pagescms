import { isContentField } from '#/lib/content-field'
import { componentLoader } from '#/lib/component-loader'

export const loadRichTextField = componentLoader(
  () => import('#/components/rich-text-field'),
)
export const loadCodeField = componentLoader(
  () => import('#/components/code-field'),
)
export const loadCodeEditor = componentLoader(() =>
  import('#/components/code-editor').then((module) => ({
    default: module.CodeEditor,
  })),
)

export async function preloadEditorComponents() {
  await Promise.all([loadRichTextField(), loadCodeField(), loadCodeEditor()])
}

/** Warm only the field editors this schema can render, while its draft loads. */
export async function preloadEditorsForFields(fields: unknown) {
  const loads = new Set<() => Promise<unknown>>()
  function visit(items: unknown) {
    if (!Array.isArray(items)) return
    for (const field of items) {
      if (!isContentField(field) || field.hidden === true) continue
      if (field.type === 'rich-text') loads.add(loadRichTextField)
      if (field.type === 'code') loads.add(loadCodeField)
      visit(field.fields)
      visit(field.blocks)
    }
  }
  visit(fields)
  await Promise.all([...loads].map((load) => load()))
}
