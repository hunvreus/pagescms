import { useId, useLayoutEffect, useRef } from 'react'
import { Field, FieldLabel, FieldDescription } from '#/components/ui/field'
import { Textarea } from '#/components/ui/textarea'

export function CollaboratorInviteInput({
  value,
  onChange,
  disabled = false,
}: {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}) {
  const id = useId()
  const input = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const element = input.current
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${element.scrollHeight}px`
  }, [value])
  return (
    <Field>
      <FieldLabel htmlFor={id}>Email addresses</FieldLabel>
      <Textarea
        ref={input}
        id={id}
        required
        rows={1}
        disabled={disabled}
        value={value}
        autoComplete="off"
        className="min-h-8 max-h-48 resize-none overflow-y-auto scrollbar"
        placeholder="name@example.com"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (
            event.key === 'Enter' &&
            !event.shiftKey &&
            !event.nativeEvent.isComposing
          ) {
            event.preventDefault()
            const form = event.currentTarget.form
            const submit = form?.querySelector<HTMLButtonElement>(
              'button[type="submit"]',
            )
            if (!disabled && submit && !submit.disabled)
              form?.requestSubmit(submit)
          }
        }}
      />
      <FieldDescription>
        Enter one or more emails, separated by commas, spaces or new lines.
        Enter sends invitations; Shift+Enter adds a line.
      </FieldDescription>
    </Field>
  )
}
