import { beforeEach, expect, it, vi } from 'vitest'

const imports = vi.hoisted(() => ({
  rich: vi.fn(),
  code: vi.fn(),
  raw: vi.fn(),
}))
vi.mock('#/components/rich-text-field', () => {
  imports.rich()
  return { default: () => null }
})
vi.mock('#/components/code-field', () => {
  imports.code()
  return { default: () => null }
})
vi.mock('#/components/code-editor', () => {
  imports.raw()
  return { CodeEditor: () => null }
})

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
})

it('does not import heavy editors for simple fields', async () => {
  const { preloadEditorsForFields } = await import('./editor-component-loaders')
  await preloadEditorsForFields([{ name: 'title', type: 'string' }])
  expect(imports.rich).not.toHaveBeenCalled()
  expect(imports.code).not.toHaveBeenCalled()
  expect(imports.raw).not.toHaveBeenCalled()
})

it('warms nested editors and shares their imports with rendering', async () => {
  const { preloadEditorsForFields, loadRichTextField, loadCodeField } =
    await import('./editor-component-loaders')
  await Promise.all([
    preloadEditorsForFields([
      { type: 'object', list: true, fields: [{ type: 'rich-text' }] },
      {
        type: 'block',
        blocks: [
          {
            name: 'example',
            fields: [{ type: 'code' }, { type: 'rich-text' }],
          },
        ],
      },
    ]),
    loadRichTextField(),
    loadCodeField(),
  ])
  expect(imports.rich).toHaveBeenCalledTimes(1)
  expect(imports.code).toHaveBeenCalledTimes(1)
  expect(imports.raw).not.toHaveBeenCalled()
})
