import {
  useLingui as useUiMessages,
  Trans as UiTrans,
} from '@lingui/react/macro'

import { Spinner } from '#/components/ui/spinner'
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from '#/components/ui/combobox'
import { Button } from '#/components/ui/button'

export interface ComboboxOption {
  value: string
  label: string
}

export function OptionCombobox({
  id,
  label,
  options,
  values,
  onChange,
  onSearch,
  placeholder,
  multiple = false,
  invalid,
  errorId,
  disabled = false,
  readOnly = false,
  required = false,
  loading = false,
  min = 0,
  max = Number.POSITIVE_INFINITY,
  onLoadMore,
  portalContainer,
}: {
  portalContainer?: HTMLElement | null
  id?: string
  label: string
  options: ComboboxOption[]
  values: string[]
  onChange: (values: string[]) => void
  onSearch?: (query: string) => void
  placeholder?: string
  multiple?: boolean
  invalid?: boolean
  errorId?: string
  disabled?: boolean
  readOnly?: boolean
  required?: boolean
  loading?: boolean
  min?: number
  max?: number
  onLoadMore?: () => void
}) {
  const { t: _t } = useUiMessages()

  const anchor = useComboboxAnchor()
  const selected = values.map(
    (value) =>
      options.find((option) => option.value === value) ?? {
        value,
        label: value,
      },
  )
  const { t: defaultT } = useUiMessages()
  return (
    <Combobox
      items={options}
      multiple={multiple}
      value={multiple ? selected : (selected[0] ?? null)}
      disabled={disabled && !readOnly}
      readOnly={readOnly}
      required={required}
      autoHighlight
      filter={onSearch ? null : undefined}
      isItemEqualToValue={(option, value) => option.value === value.value}
      onInputValueChange={(query, details) => {
        if (
          details.reason === 'input-change' ||
          details.reason === 'input-clear'
        )
          onSearch?.(query)
      }}
      onValueChange={(value) => {
        if (readOnly || disabled) return
        const next = (Array.isArray(value) ? value : value ? [value] : []).map(
          (option) => option.value,
        )
        if (
          multiple &&
          (next.length > max ||
            (next.length < min && next.length < values.length))
        )
          return
        onChange(next)
      }}
    >
      {multiple ? (
        <ComboboxChips ref={anchor} className="w-full">
          <ComboboxValue>
            {selected.map((option) => (
              <ComboboxChip
                key={option.value}
                showRemove={!disabled && !readOnly && values.length > min}
                removeLabel={_t({ message: `Remove ${option.label}` })}
                className="max-w-full min-w-0"
              >
                <span className="truncate">{option.label}</span>
              </ComboboxChip>
            ))}
          </ComboboxValue>
          <ComboboxChipsInput
            id={id}
            aria-label={label}
            aria-invalid={invalid || undefined}
            aria-describedby={errorId}
            placeholder={
              selected.length
                ? undefined
                : (placeholder ?? defaultT({ message: 'Select…' }))
            }
          />
        </ComboboxChips>
      ) : (
        <ComboboxInput
          id={id}
          aria-label={label}
          aria-invalid={invalid || undefined}
          aria-describedby={errorId}
          className="w-full"
          placeholder={placeholder ?? defaultT({ message: 'Select…' })}
          showClear={!disabled && !readOnly && selected.length > 0 && !required}
        />
      )}
      <ComboboxContent
        anchor={multiple ? anchor : undefined}
        container={portalContainer}
      >
        <ComboboxEmpty>
          {loading
            ? _t({ message: 'Loading options…' })
            : _t({ message: 'No options found.' })}
        </ComboboxEmpty>
        <ComboboxList>
          {(option: ComboboxOption) => {
            const checked = values.includes(option.value)
            return (
              <ComboboxItem
                key={option.value}
                value={option}
                disabled={
                  multiple &&
                  (checked ? values.length <= min : values.length >= max)
                }
              >
                {option.label}
              </ComboboxItem>
            )
          }}
        </ComboboxList>
        {onLoadMore ? (
          <Button
            aria-busy={loading}
            className="m-1"
            size="sm"
            type="button"
            variant="ghost"
            disabled={loading}
            onClick={onLoadMore}
          >
            <UiTrans>Load more</UiTrans>
            {loading ? (
              <Spinner aria-hidden="true" data-icon="inline-end" />
            ) : null}
          </Button>
        ) : null}
      </ComboboxContent>
    </Combobox>
  )
}
