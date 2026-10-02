import { CodeEditor } from './code-editor'

import type { JsonObject, JsonValue } from '#/lib/json'

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
  const options = field.options
  const format =
    typeof options === 'object' &&
    options !== null &&
    !Array.isArray(options) &&
    typeof options.format === 'string'
      ? options.format
      : 'markdown'
  return (
    <CodeEditor
      disabled={disabled || field.readonly === true}
      format={format}
      id={id}
      label={label}
      required={required}
      value={typeof value === 'string' ? value : ''}
      onChange={onChange}
    />
  )
}
