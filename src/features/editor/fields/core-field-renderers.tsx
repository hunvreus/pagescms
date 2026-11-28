import { useLingui as useUiMessages } from '@lingui/react/macro'
import { HugeiconsIcon } from '@hugeicons/react'
import RefreshCw from '@hugeicons/core-free-icons/RefreshCwIcon'

import { Button } from '#/components/ui/button'
import { OptionCombobox } from '#/components/option-combobox'
import { Input } from '#/components/ui/input'
import { Switch } from '#/components/ui/switch'
import { Textarea } from '#/components/ui/textarea'

import { createFieldRendererRegistry } from './field-renderer-registry'
import { selectOptions } from '#/lib/select-options'
import {
  multipleFieldLimits,
  normalizeFieldValue,
  referenceOption,
} from '#/lib/field-value-shapes'
import { parseFieldDate } from '#/lib/date-field'

import type { FieldRendererProps } from './field-renderer-registry'
import type { JsonObject } from '#/shared/json'

function isRecord(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function options(field: JsonObject) {
  return isRecord(field.options) ? field.options : {}
}

function StringRenderer({
  invalid,
  errorId,
  disabled,
  field,
  id,
  required,
  value,
  onChange,
  renderField,
}: FieldRendererProps) {
  const settings = options(field)
  return renderField(
    <Input
      dir="auto"
      aria-invalid={invalid || undefined}
      aria-describedby={errorId}
      disabled={disabled && field.readonly !== true}
      readOnly={field.readonly === true}
      id={id}
      maxLength={
        typeof settings.maxlength === 'number' ? settings.maxlength : undefined
      }
      minLength={
        typeof settings.minlength === 'number' ? settings.minlength : undefined
      }
      required={required}
      value={typeof value === 'string' ? value : ''}
      onChange={(event) => onChange(event.target.value)}
    />,
  )
}

function TextRenderer(props: FieldRendererProps) {
  const settings = options(props.field)
  return props.renderField(
    <Textarea
      dir="auto"
      aria-invalid={props.invalid || undefined}
      aria-describedby={props.errorId}
      className="min-h-32"
      disabled={props.disabled && props.field.readonly !== true}
      readOnly={props.field.readonly === true}
      minLength={
        typeof settings.minlength === 'number' ? settings.minlength : undefined
      }
      maxLength={
        typeof settings.maxlength === 'number' ? settings.maxlength : undefined
      }
      id={props.id}
      required={props.required}
      value={typeof props.value === 'string' ? props.value : ''}
      onChange={(event) => props.onChange(event.target.value)}
    />,
  )
}

function NumberRenderer({
  invalid,
  errorId,
  disabled,
  field,
  id,
  required,
  value,
  onChange,
  renderField,
}: FieldRendererProps) {
  const settings = options(field)
  const normalized = normalizeFieldValue(field, value)
  return renderField(
    <Input
      aria-invalid={invalid || undefined}
      aria-describedby={errorId}
      disabled={disabled && field.readonly !== true}
      readOnly={field.readonly === true}
      id={id}
      max={typeof settings.max === 'number' ? settings.max : undefined}
      min={typeof settings.min === 'number' ? settings.min : undefined}
      required={required}
      step={
        typeof settings.step === 'number' || settings.step === 'any'
          ? settings.step
          : undefined
      }
      type="number"
      value={typeof normalized === 'number' ? normalized : ''}
      onChange={(event) =>
        onChange(
          event.target.value === '' ? undefined : event.target.valueAsNumber,
        )
      }
    />,
  )
}

function DateRenderer({
  invalid,
  errorId,
  disabled,
  field,
  id,
  required,
  value,
  onChange,
  renderField,
}: FieldRendererProps) {
  const settings = options(field)
  return renderField(
    <Input
      aria-invalid={invalid || undefined}
      aria-describedby={errorId}
      disabled={disabled && field.readonly !== true}
      readOnly={field.readonly === true}
      id={id}
      max={typeof settings.max === 'string' ? settings.max : undefined}
      min={typeof settings.min === 'string' ? settings.min : undefined}
      step={
        typeof settings.step === 'number' || settings.step === 'any'
          ? settings.step
          : undefined
      }
      required={required}
      type={
        typeof value === 'string' && value && !parseFieldDate(value, field)
          ? 'text'
          : settings.time === true
            ? 'datetime-local'
            : 'date'
      }
      value={typeof value === 'string' ? value : ''}
      onChange={(event) => onChange(event.target.value)}
    />,
  )
}

function BooleanRenderer({
  invalid,
  errorId,
  disabled,
  id,
  value,
  onChange,
  renderField,
}: FieldRendererProps) {
  return renderField(
    <Switch
      aria-invalid={invalid || undefined}
      aria-describedby={errorId}
      checked={value === true}
      disabled={disabled}
      id={id}
      onCheckedChange={onChange}
    />,
  )
}

function UuidRenderer({
  invalid,
  errorId,
  disabled,
  field,
  id,
  value,
  onChange,
  renderField,
}: FieldRendererProps) {
  const { t: _t } = useUiMessages()

  const settings = options(field)
  return renderField(
    <div className="flex gap-2">
      <Input
        aria-invalid={invalid || undefined}
        aria-describedby={errorId}
        disabled={disabled && field.readonly !== true}
        id={id}
        readOnly={field.readonly === true || settings.editable !== true}
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(event.target.value)}
      />
      {settings.generate !== false ? (
        <Button
          aria-label={_t({ message: `Generate ${String(field.name)}` })}
          disabled={disabled}
          size="icon"
          type="button"
          variant="outline"
          onClick={() => onChange(crypto.randomUUID())}
        >
          <HugeiconsIcon aria-hidden="true" icon={RefreshCw} />
        </Button>
      ) : null}
    </div>,
  )
}

function SelectRenderer({
  invalid,
  errorId,
  disabled,
  field,
  id,
  label,
  required,
  value,
  onChange,
  renderField,
}: FieldRendererProps) {
  const settings = options(field)
  const savedOptions = (Array.isArray(value) ? value : [value]).flatMap(
    (item) => {
      const option = referenceOption(item)
      return option ? [option] : []
    },
  )
  const choices = [
    ...new Map(
      [...savedOptions, ...selectOptions(field)].map((option) => [
        option.value,
        option,
      ]),
    ).values(),
  ]
  const multiple = Boolean(settings.multiple)
  value = normalizeFieldValue(field, value)
  const selected = multiple
    ? Array.isArray(value)
      ? value.map(String)
      : []
    : value == null || value === ''
      ? []
      : [String(value)]
  const limits = multipleFieldLimits(field)
  const min = typeof limits.min === 'number' ? limits.min : 0
  const max =
    typeof limits.max === 'number' ? limits.max : Number.POSITIVE_INFINITY
  return renderField(
    <OptionCombobox
      invalid={invalid}
      errorId={errorId}
      id={id}
      label={label}
      disabled={disabled}
      readOnly={field.readonly === true}
      required={required}
      multiple={multiple}
      min={min}
      max={max}
      options={choices}
      values={selected}
      placeholder={
        typeof settings.placeholder === 'string'
          ? settings.placeholder
          : undefined
      }
      onChange={(next) => onChange(multiple ? next : next[0])}
    />,
  )
}

export const coreFieldRendererRegistry = createFieldRendererRegistry({
  boolean: BooleanRenderer,
  date: DateRenderer,
  number: NumberRenderer,
  select: SelectRenderer,
  string: StringRenderer,
  text: TextRenderer,
  uuid: UuidRenderer,
})
