import { isLocale, localeLabels, locales } from '#/i18n/locale'
import {
  Trans as UiTrans,
  useLingui as useUiMessages,
} from '@lingui/react/macro'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from '#/components/ui/field'
import { settingsRowClassName } from '#/components/settings-row'

export function LanguageField({
  anonymous = false,
  disabled = true,
  busy = false,
  onChange,
}: {
  anonymous?: boolean
  disabled?: boolean
  busy?: boolean
  onChange?: (value: string) => void
}) {
  const { i18n, t } = useUiMessages()
  return (
    <Field
      orientation="horizontal"
      className={
        anonymous
          ? settingsRowClassName
          : `${settingsRowClassName} border-b py-4 first:pt-0`
      }
    >
      <FieldContent>
        <FieldLabel htmlFor="interface-language">
          <UiTrans>Interface language</UiTrans>
        </FieldLabel>
        {!anonymous ? (
          <FieldDescription>
            <UiTrans>
              Choose the language used by the app. Content languages stay
              unchanged.
            </UiTrans>
          </FieldDescription>
        ) : null}
      </FieldContent>
      <Select value={i18n.locale} disabled={disabled} onValueChange={onChange}>
        <SelectTrigger
          id="interface-language"
          aria-label={t`Interface language`}
          aria-busy={busy}
          className="w-full justify-self-end"
        >
          <SelectValue>
            {localeLabels[isLocale(i18n.locale) ? i18n.locale : 'en']}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {locales.map((locale) => (
              <SelectItem key={locale} value={locale}>
                {localeLabels[locale]}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  )
}
