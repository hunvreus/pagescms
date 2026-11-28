import { TestI18n } from '#/i18n/test-provider'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { diagnosticCount, setDiagnostics } from '@codemirror/lint'
import { EditorState, StateEffect } from '@codemirror/state'
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
  it('passes a placeholder to the shared editor without adding content', () => {
    const onChange = vi.fn()
    renderToStaticMarkup(
      <TestI18n>
        {
          <CodeEditor
            label="Configuration"
            value=""
            placeholder="Add your .pages.yml configuration."
            onChange={onChange}
          />
        }
      </TestI18n>,
    )
    expect(captured.props.placeholder).toBe(
      'Add your .pages.yml configuration.',
    )
    expect(captured.props.value).toBe('')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('preserves diagnostics when CodeMirror reconfigures its extensions', () => {
    renderToStaticMarkup(
      <TestI18n>
        {
          <CodeEditor
            label="Configuration"
            format="yaml"
            value="content: ["
            onChange={() => undefined}
          />
        }
      </TestI18n>,
    )
    const extensions = captured.props.extensions ?? []
    let state = EditorState.create({ doc: 'content: [', extensions })
    state = state.update(
      setDiagnostics(state, [
        { from: 10, to: 10, severity: 'error', message: 'Unclosed sequence' },
      ]),
    ).state
    expect(diagnosticCount(state)).toBe(1)
    state = state.update({
      effects: StateEffect.reconfigure.of(extensions),
    }).state
    expect(diagnosticCount(state)).toBe(1)
  })

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
      <TestI18n>
        {
          <CodeField
            disabled={false}
            field={{ options: { format: 'json' } }}
            id="script"
            label="Script"
            required
            value={'{"answer":42}'}
            onChange={onChange}
          />
        }
      </TestI18n>,
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
        <TestI18n>
          {
            <CodeField
              disabled={disabled}
              field={{ readonly }}
              id="script"
              label="Script"
              required={false}
              value="source"
              onChange={() => undefined}
            />
          }
        </TestI18n>,
      )
      expect(captured.props.editable).toBe(false)
      expect(captured.props.readOnly).toBe(true)
    },
  )

  it('keeps configuration diagnostics and lets the shared editor grow with its content', () => {
    renderToStaticMarkup(
      <TestI18n>
        {
          <CodeEditor
            format="yaml"
            diagnostics={[
              { from: 0, to: 3, severity: 'error', message: 'Invalid value' },
            ]}
            label="Configuration"
            value="bad"
            onChange={() => undefined}
          />
        }
      </TestI18n>,
    )
    expect(captured.props.height).toBeUndefined()
    expect(captured.props.basicSetup).toMatchObject({
      lineNumbers: false,
      searchKeymap: false,
      highlightActiveLine: false,
      highlightActiveLineGutter: false,
    })
  })
})
