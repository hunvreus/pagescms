import {
  useLingui as useUiMessages,
  Trans as UiTrans,
} from '@lingui/react/macro'

import { useId, useState } from 'react'
import { cn } from 'cn'
import {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
} from '#/components/ui/field'
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxValue,
} from '#/components/ui/combobox'
import {
  collaboratorEmail,
  splitCollaboratorRecipients,
} from '#/lib/collaborator-invites'

export function CollaboratorInviteInput({
  value,
  onChange,
  disabled = false,
  showDescription = true,
  error,
  chipsClassName,
}: {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  showDescription?: boolean
  error?: string
  chipsClassName?: string
}) {
  const { t: remainingT } = useUiMessages()

  const { t: _t } = useUiMessages()

  const id = useId()
  const [draft, setDraft] = useState({
    value,
    recipients: splitCollaboratorRecipients(value),
    input: '',
  })
  const current =
    draft.value === value
      ? draft
      : { value, recipients: splitCollaboratorRecipients(value), input: '' }
  const invalid = current.recipients.filter(
    (recipient) => !collaboratorEmail(recipient),
  )
  const message =
    error ??
    (invalid.length
      ? remainingT({ message: 'Enter a valid email address for each person' })
      : undefined)
  function update(recipients: string[], input: string) {
    const text = [...recipients, input].filter(Boolean).join(', ')
    setDraft({ value: text, recipients, input })
    onChange(text)
  }
  function commit(input = current.input) {
    const recipients = splitCollaboratorRecipients(input).map(
      (recipient) => collaboratorEmail(recipient) ?? recipient,
    )
    update([...new Set([...current.recipients, ...recipients])], '')
  }
  return (
    <Field data-invalid={Boolean(message)}>
      <FieldLabel htmlFor={id}>
        <UiTrans>Email addresses</UiTrans>
      </FieldLabel>
      <Combobox
        multiple
        open={false}
        disabled={disabled}
        value={current.recipients}
        inputValue={current.input}
        onValueChange={(recipients) => update(recipients, current.input)}
        onInputValueChange={(input, details) => {
          if (
            details.reason !== 'input-change' &&
            details.reason !== 'input-clear'
          )
            return
          const quoted = (input.match(/"/g)?.length ?? 0) % 2 !== 0
          const unfinished = input.lastIndexOf('<') > input.lastIndexOf('>')
          if (/[,;\n]$/.test(input) && !quoted && !unfinished) commit(input)
          else update(current.recipients, input)
        }}
      >
        <ComboboxChips className={cn('w-full', chipsClassName)}>
          <ComboboxValue>
            {current.recipients.map((recipient) => (
              <ComboboxChip
                key={recipient}
                showRemove={!disabled}
                removeLabel={_t({ message: `Remove ${recipient}` })}
                className="max-w-full min-w-0"
                aria-invalid={!collaboratorEmail(recipient)}
              >
                <span className="truncate">{recipient}</span>
              </ComboboxChip>
            ))}
          </ComboboxValue>
          <ComboboxChipsInput
            id={id}
            aria-invalid={Boolean(message)}
            aria-describedby={
              [showDescription && `${id}-help`, message && `${id}-error`]
                .filter(Boolean)
                .join(' ') || undefined
            }
            autoComplete="off"
            inputMode="email"
            placeholder={
              current.recipients.length
                ? undefined
                : _t({ message: 'name@example.com' })
            }
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                event.preventDefault()
                commit()
              }
            }}
            onBlur={() => {
              if (current.input.trim()) commit()
            }}
            onPaste={(event) => {
              const text = event.clipboardData.getData('text')
              if (!/[,;\s<>]/.test(text)) return
              event.preventDefault()
              const input = event.currentTarget
              commit(
                current.input.slice(0, input.selectionStart ?? 0) +
                  text +
                  current.input.slice(
                    input.selectionEnd ?? current.input.length,
                  ),
              )
            }}
          />
        </ComboboxChips>
      </Combobox>
      {showDescription && (
        <FieldDescription id={`${id}-help`}>
          <UiTrans>Invitations expire after 24 hours.</UiTrans>
        </FieldDescription>
      )}
      {message ? <FieldError id={`${id}-error`}>{message}</FieldError> : null}
    </Field>
  )
}
