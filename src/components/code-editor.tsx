import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { githubDark, githubLight } from '@uiw/codemirror-theme-github'
import { linter, setDiagnostics } from '@codemirror/lint'
import { EditorView } from '@codemirror/view'

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

function subscribeTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  })
  return () => observer.disconnect()
}

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
  autoFocus = false,
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
  autoFocus?: boolean
}) {
  const dark = useSyncExternalStore(
    subscribeTheme,
    () => document.documentElement.classList.contains('dark'),
    () => false,
  )
  const [view, setView] = useState<EditorView>()
  useEffect(() => {
    if (view && autoFocus && !disabled) view.focus()
  }, [view, autoFocus, disabled])
  useEffect(() => {
    if (view)
      view.dispatch(
        setDiagnostics(
          view.state,
          lintDiagnostics(diagnostics, view.state.doc.length),
        ),
      )
  }, [view, diagnostics, value, dark, format])
  const extensions = useMemo(
    () => [
      codeEditorLanguage(format),
      // Keep lint state across the wrapper's extension reconfiguration.
      linter(null),
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({
        'aria-label': label,
        'aria-required': String(required),
        'aria-disabled': String(disabled),
        ...(id ? { id } : {}),
      }),
    ],
    [label, format, id, required, disabled],
  )

  return (
    <CodeMirror
      basicSetup={{
        foldGutter: false,
        highlightActiveLine: false,
        highlightActiveLineGutter: false,
        lineNumbers: false,
        searchKeymap: false,
      }}
      theme={dark ? githubDark : githubLight}
      onCreateEditor={setView}
      className={cn(
        'pagescms-code-editor overflow-hidden rounded-md border border-input bg-background text-sm transition-colors focus-within:border-ring [&_.cm-editor]:outline-none [&_.cm-scroller]:scrollbar',
        disabled && 'opacity-65',
        className,
      )}
      extensions={extensions}
      minHeight="8rem"
      editable={!disabled}
      readOnly={disabled}
      value={value}
      onChange={(source) => onChange(source)}
    />
  )
}
