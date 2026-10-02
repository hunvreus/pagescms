import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { EditorState } from '@codemirror/state'
import { syntaxTree } from '@codemirror/language'

import CodeField from './code-field'
import { CodeEditor } from './code-editor'
import { codeEditorLanguage } from './code-editor-language'

import type { ReactCodeMirrorProps } from '@uiw/react-codemirror'

const captured: { props: ReactCodeMirrorProps } = vi.hoisted(() => ({
  props: {},
}))
vi.mock('@uiw/react-codemirror', () => ({
  default: (props: ReactCodeMirrorProps) => {
    captured.props = props
    return null
  },
}))

describe('CodeMirror code fields', () => {
  it.each([
    'yaml',
    'yml',
    'js',
    'jsx',
    'ts',
    'tsx',
    'json',
    'html',
    'htm',
    'md',
    'mdx',
  ])('uses a real parser for %s', (format) => {
    const state = EditorState.create({
      doc: 'value',
      extensions: [codeEditorLanguage(format)],
    })
    expect(syntaxTree(state).type.name).not.toBe('')
  })

  it('parses TypeScript annotations and JSX together', () => {
    const state = EditorState.create({
      doc: 'const view: JSX.Element = <div />',
      extensions: [codeEditorLanguage('tsx')],
    })
    let hasError = false
    syntaxTree(state).iterate({
      enter: (node) => {
        if (node.type.isError) hasError = true
      },
    })
    expect(hasError).toBe(false)
    expect(syntaxTree(state).toString()).toContain('TypeAnnotation')
  })

  it('preserves values and change callbacks, with field accessibility and compact setup', () => {
    const onChange = vi.fn()
    renderToStaticMarkup(
      <CodeField
        disabled={false}
        field={{ options: { format: 'json' } }}
        id="script"
        label="Script"
        required
        value={'{"answer":42}'}
        onChange={onChange}
      />,
    )
    expect(captured.props.value).toBe('{"answer":42}')
    expect(captured.props.editable).toBe(true)
    expect(captured.props.minHeight).toBe('8rem')
    expect(captured.props.basicSetup).toMatchObject({ lineNumbers: false })
    const state = EditorState.create({ extensions: captured.props.extensions })
    expect(state.facet(EditorState.readOnly)).toBe(false)
    captured.props.onChange?.(
      'changed',
      {} as Parameters<NonNullable<ReactCodeMirrorProps['onChange']>>[1],
    )
    expect(onChange).toHaveBeenCalledWith('changed')
  })

  it.each([
    { disabled: true, readonly: false },
    { disabled: false, readonly: true },
  ])(
    'prevents editing when disabled or readonly: %j',
    ({ disabled, readonly }) => {
      renderToStaticMarkup(
        <CodeField
          disabled={disabled}
          field={{ readonly }}
          id="script"
          label="Script"
          required={false}
          value="source"
          onChange={() => undefined}
        />,
      )
      expect(captured.props.editable).toBe(false)
      expect(captured.props.readOnly).toBe(true)
    },
  )

  it('keeps configuration diagnostics and full-height setup on the shared editor', () => {
    renderToStaticMarkup(
      <CodeEditor
        configuration
        format="yaml"
        diagnostics={[
          { from: 0, to: 3, severity: 'error', message: 'Invalid value' },
        ]}
        label="Configuration"
        value="bad"
        onChange={() => undefined}
      />,
    )
    expect(captured.props.height).toBe('calc(100vh - 7rem)')
    expect(captured.props.basicSetup).toMatchObject({
      lineNumbers: true,
      searchKeymap: true,
    })
  })
})
