import { useMemo } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { lintGutter, linter } from '@codemirror/lint'
import { EditorView } from '@codemirror/view'
import { tags } from '@lezer/highlight'

import { cn } from '#/lib/utils'
import { codeEditorLanguage } from './code-editor-language'

import type { Diagnostic } from '@codemirror/lint'

type SourceDiagnostic = {
  from: number | null
  to: number | null
  severity: 'error' | 'warning'
  message: string
}
const noDiagnostics: readonly SourceDiagnostic[] = []

const theme = EditorView.theme({
  '&': {
    backgroundColor: 'transparent',
    color: 'var(--foreground)',
    fontSize: '13px',
  },
  '.cm-content': {
    caretColor: 'var(--foreground)',
    fontFamily:
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    lineHeight: '1.5rem',
    padding: '0.75rem 0',
  },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    borderRight: '1px solid var(--border)',
    color: 'var(--muted-foreground)',
  },
  '.cm-activeLine, .cm-activeLineGutter': {
    backgroundColor: 'color-mix(in oklab, var(--muted) 45%, transparent)',
  },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--foreground)' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection':
    {
      backgroundColor: 'color-mix(in oklab, var(--primary) 22%, transparent)',
    },
  '.cm-tooltip': {
    backgroundColor: 'var(--popover)',
    border: '1px solid var(--border)',
    color: 'var(--popover-foreground)',
  },
})

const syntaxTheme = HighlightStyle.define([
  { tag: tags.comment, color: 'var(--muted-foreground)', fontStyle: 'italic' },
  {
    tag: [tags.keyword, tags.atom, tags.bool, tags.null],
    color: 'var(--chart-1)',
  },
  {
    tag: [tags.string, tags.special(tags.string)],
    color: 'var(--chart-2)',
  },
  {
    tag: [tags.number, tags.integer, tags.float],
    color: 'var(--chart-3)',
  },
  {
    tag: [tags.propertyName, tags.attributeName, tags.labelName],
    color: 'var(--foreground)',
    fontWeight: '600',
  },
  { tag: [tags.punctuation, tags.separator], color: 'var(--muted-foreground)' },
  { tag: tags.invalid, color: 'var(--destructive)' },
])

function lintDiagnostics(
  diagnostics: readonly SourceDiagnostic[],
  length: number,
): Diagnostic[] {
  return diagnostics.map((diagnostic) => {
    const from = Math.min(Math.max(diagnostic.from ?? 0, 0), length)
    const to = Math.min(
      Math.max(diagnostic.to ?? Math.min(from + 1, length), from),
      length,
    )
    return {
      from,
      to,
      severity: diagnostic.severity,
      message: diagnostic.message,
      source: 'Pages CMS',
    }
  })
}

export function CodeEditor({
  value,
  diagnostics = noDiagnostics,
  onChange,
  className,
  label,
  format = 'markdown',
  id,
  disabled = false,
  required = false,
  configuration = false,
}: {
  value: string
  diagnostics?: readonly SourceDiagnostic[]
  onChange: (value: string) => void
  className?: string
  label: string
  format?: string
  id?: string
  disabled?: boolean
  required?: boolean
  configuration?: boolean
}) {
  const extensions = useMemo(
    () => [
      codeEditorLanguage(format),
      EditorView.lineWrapping,
      ...(configuration || diagnostics.length
        ? [
            lintGutter(),
            linter((view) =>
              lintDiagnostics(diagnostics, view.state.doc.length),
            ),
          ]
        : []),
      EditorView.contentAttributes.of({
        'aria-label': label,
        'aria-required': String(required),
        'aria-disabled': String(disabled),
        ...(id ? { id } : {}),
      }),
      theme,
      syntaxHighlighting(syntaxTheme),
    ],
    [diagnostics, label, format, id, required, disabled, configuration],
  )

  return (
    <CodeMirror
      basicSetup={{
        foldGutter: false,
        highlightActiveLine: configuration,
        highlightActiveLineGutter: configuration,
        lineNumbers: configuration,
        searchKeymap: configuration,
      }}
      className={cn(
        'pagescms-code-editor overflow-hidden rounded-md border border-input bg-background text-sm transition-[color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 [&_.cm-editor]:outline-none [&_.cm-scroller]:scrollbar',
        disabled && 'opacity-65',
        className,
      )}
      extensions={extensions}
      height={configuration ? 'calc(100vh - 7rem)' : undefined}
      minHeight={configuration ? '24rem' : '8rem'}
      editable={!disabled}
      readOnly={disabled}
      value={value}
      onChange={(source) => onChange(source)}
    />
  )
}
