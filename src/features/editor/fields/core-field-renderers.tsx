import { RefreshCw } from 'lucide-react'

import { Button } from '#/components/ui/button'
import { Checkbox } from '#/components/ui/checkbox'
import { Input } from '#/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import { Switch } from '#/components/ui/switch'
import { Textarea } from '#/components/ui/textarea'

import { createFieldRendererRegistry } from './field-renderer-registry'
import { selectOptions } from '#/lib/select-options'

import type { FieldRendererProps } from './field-renderer-registry'
import type { JsonObject } from '#/lib/json'

function isRecord(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function options(field: JsonObject) {
  return isRecord(field.options) ? field.options : {}
}

function StringRenderer({
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
      disabled={disabled}
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
  return props.renderField(
    <Textarea
      className="min-h-32"
      disabled={props.disabled}
      id={props.id}
      required={props.required}
      value={typeof props.value === 'string' ? props.value : ''}
      onChange={(event) => props.onChange(event.target.value)}
    />,
  )
}

function NumberRenderer({
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
      disabled={disabled}
      id={id}
      max={typeof settings.max === 'number' ? settings.max : undefined}
      min={typeof settings.min === 'number' ? settings.min : undefined}
      required={required}
      step={typeof settings.step === 'number' ? settings.step : undefined}
      type="number"
      value={typeof value === 'number' ? value : ''}
      onChange={(event) =>
        onChange(
          event.target.value === '' ? undefined : event.target.valueAsNumber,
        )
      }
    />,
  )
}

function DateRenderer({
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
      disabled={disabled}
      id={id}
      max={typeof settings.max === 'string' ? settings.max : undefined}
      min={typeof settings.min === 'string' ? settings.min : undefined}
      step={typeof settings.step === 'number' ? settings.step : undefined}
      required={required}
      type={settings.time === true ? 'datetime-local' : 'date'}
      value={typeof value === 'string' ? value : ''}
      onChange={(event) => onChange(event.target.value)}
    />,
  )
}

function BooleanRenderer({
  disabled,
  id,
  value,
  onChange,
  renderField,
}: FieldRendererProps) {
  return renderField(
    <Switch
      checked={value === true}
      disabled={disabled}
      id={id}
      onCheckedChange={onChange}
    />,
  )
}

function UuidRenderer({
  disabled,
  field,
  id,
  value,
  onChange,
  renderField,
}: FieldRendererProps) {
  const settings = options(field)
  return renderField(
    <div className="flex gap-2">
      <Input
        disabled={disabled}
        id={id}
        readOnly={settings.editable !== true}
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(event.target.value)}
      />
      {settings.generate !== false ? (
        <Button
          aria-label={`Generate ${String(field.name)}`}
          disabled={disabled}
          size="icon"
          type="button"
          variant="outline"
          onClick={() => onChange(crypto.randomUUID())}
        >
          <RefreshCw />
        </Button>
      ) : null}
    </div>,
  )
}

function SelectRenderer({
  disabled,
  field,
  id,
  value,
  onChange,
  renderField,
}: FieldRendererProps) {
  const settings = options(field)
  const choices = selectOptions(field)
  if (!settings.multiple) {
    return renderField(
      <Select
        disabled={disabled}
        value={value == null ? '' : String(value)}
        onValueChange={(next) => onChange(next || undefined)}
      >
        <SelectTrigger className="w-full" id={id}>
          <SelectValue
            placeholder={
              typeof settings.placeholder === 'string'
                ? settings.placeholder
                : 'Select…'
            }
          />
        </SelectTrigger>
        <SelectContent>
          {choices.map((choice) => (
            <SelectItem key={choice.value} value={choice.value}>
              {choice.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>,
    )
  }

  const selected = Array.isArray(value) ? value : []
  const min = typeof settings.min === 'number' ? settings.min : 0
  const max =
    typeof settings.max === 'number' ? settings.max : Number.POSITIVE_INFINITY
  return renderField(
    <div className="grid gap-1 rounded-lg border p-2">
      {choices.map((choice) => {
        const checked = selected.includes(choice.value)
        return (
          <label
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50"
            key={choice.value}
          >
            <Checkbox
              checked={checked}
              disabled={
                disabled ||
                (checked ? selected.length <= min : selected.length >= max)
              }
              onCheckedChange={(next) =>
                onChange(
                  next
                    ? [...selected, choice.value]
                    : selected.filter((item) => item !== choice.value),
                )
              }
            />
            {choice.label}
          </label>
        )
      })}
    </div>,
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
