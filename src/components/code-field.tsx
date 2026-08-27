import { useMemo, useState } from 'react'

import type { JsonObject, JsonValue } from '#/lib/json'

type TokenKind = 'comment' | 'keyword' | 'number' | 'punctuation' | 'string'

const keywords = new Set(
  'async await break case catch class const continue debugger default delete do else export extends false finally for from function if import in instanceof let new null of return static super switch this throw true try typeof undefined var void while with yield'.split(
    ' ',
  ),
)

function fieldOptions(field: JsonObject) {
  return typeof field.options === 'object' &&
    field.options !== null &&
    !Array.isArray(field.options)
    ? field.options
    : {}
}

function tokenKind(value: string, format: unknown): TokenKind | undefined {
  if (/^(?:\/\/|\/\*|#|<!--)/.test(value)) return 'comment'
  if (/^(?:"|'|`)/.test(value)) return 'string'
  if (/^-?\d/.test(value)) return 'number'
  if (keywords.has(value) || /^(?:true|false|null)$/.test(value)) {
    return 'keyword'
  }
  if (/^[{}[\]():,.;<>/=+-]+$/.test(value)) return 'punctuation'
  if (
    (format === 'yaml' || format === 'yml' || format === 'json') &&
    /:$/.test(value)
  ) {
    return 'keyword'
  }
}

function highlighted(value: string, format: unknown) {
  const pattern =
    /(<!--[\s\S]*?-->|\/\*[\s\S]*?\*\/|\/\/[^\n]*|#[^\n]*|`(?:\\.|[^`])*`|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|-?\b\d+(?:\.\d+)?\b|\b[A-Za-z_$][\w$]*:?|[{}[\]():,.;<>/=+-]+)/g
  const nodes: React.ReactNode[] = []
  let cursor = 0
  for (const match of value.matchAll(pattern)) {
    const index = match.index
    if (index > cursor) nodes.push(value.slice(cursor, index))
    const text = match[0]
    const kind = tokenKind(text, format)
    nodes.push(
      kind ? (
        <span className={`code-token-${kind}`} key={`${index}:${text}`}>
          {text}
        </span>
      ) : (
        text
      ),
    )
    cursor = index + text.length
  }
  if (cursor < value.length) nodes.push(value.slice(cursor))
  return nodes
}

export default function CodeField({
  field,
  id,
  label,
  value,
  disabled,
  required,
  onChange,
}: {
  field: JsonObject
  id: string
  label: string
  value: JsonValue | undefined
  disabled: boolean
  required: boolean
  onChange: (value: JsonValue | undefined) => void
}) {
  const source = typeof value === 'string' ? value : ''
  const format = fieldOptions(field).format
  const tokens = useMemo(() => highlighted(source, format), [format, source])
  const [scroll, setScroll] = useState({ left: 0, top: 0 })

  return (
    <div className="pagescms-code-field">
      <pre
        aria-hidden="true"
        style={{ transform: `translate(${-scroll.left}px, ${-scroll.top}px)` }}
      >
        <code>{tokens}</code>
      </pre>
      <textarea
        aria-label={label}
        disabled={disabled}
        id={id}
        required={required}
        spellCheck={false}
        value={source}
        onChange={(event) => onChange(event.target.value)}
        onScroll={(event) =>
          setScroll({
            left: event.currentTarget.scrollLeft,
            top: event.currentTarget.scrollTop,
          })
        }
      />
    </div>
  )
}
