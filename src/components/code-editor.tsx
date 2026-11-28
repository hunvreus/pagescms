import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { githubDark, githubLight } from '@uiw/codemirror-theme-github'
import { linter, setDiagnostics } from '@codemirror/lint'
import { EditorView } from '@codemirror/view'

import { useLingui } from '@lingui/react'
import { localizeErrorMessage } from '#/i18n/errors'
import type { I18n } from '@lingui/core'

import { cn } from 'cn'
import { codeEditorLanguage } from './code-editor-language'

import type { Diagnostic } from '@codemirror/lint'
import type { Extension } from '@codemirror/state'

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
  i18n: I18n,
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
      message: localizeErrorMessage(i18n, diagnostic.message),
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
  readOnly = false,
  required = false,
  autoFocus = false,
  extraExtension,
  placeholder,
}: {
  value: string
  diagnostics?: readonly SourceDiagnostic[]
  onChange: (value: string) => void
  className?: string
  label: string
  format?: string
  id?: string
  disabled?: boolean
  readOnly?: boolean
  required?: boolean
  autoFocus?: boolean
  extraExtension?: Extension
  placeholder?: string
}) {
  const { i18n } = useLingui()
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
          lintDiagnostics(diagnostics, view.state.doc.length, i18n),
        ),
      )
  }, [view, diagnostics, value, dark, format, i18n, i18n.locale])
  const extensions = useMemo(
    () => [
      codeEditorLanguage(format),
      ...(extraExtension ? [extraExtension] : []),
      // Keep lint state across the wrapper's extension reconfiguration.
      linter(null),
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({
        'aria-label': label,
        'aria-required': String(required),
        'aria-disabled': String(disabled),
        'aria-readonly': String(readOnly || disabled),
        ...(id ? { id } : {}),
      }),
    ],
    [label, format, id, required, disabled, readOnly, extraExtension],
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
        'pagescms-code-editor min-h-32 overflow-hidden rounded-md border border-input bg-background text-sm transition-colors focus-within:border-ring [&_.cm-editor]:outline-none [&_.cm-scroller]:scrollbar',
        disabled && 'opacity-65',
        className,
      )}
      extensions={extensions}
      minHeight="8rem"
      editable={!disabled && !readOnly}
      readOnly={disabled || readOnly}
      value={value}
      placeholder={placeholder}
      onChange={(source) => onChange(source)}
    />
  )
}
