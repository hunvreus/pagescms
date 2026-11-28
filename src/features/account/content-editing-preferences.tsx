import { LanguagePreference } from './language-preference'
import { ThemePreference } from './theme-preference'
import {
  Trans as UiTrans,
  useLingui as useUiMessages,
} from '@lingui/react/macro'
import { Card, CardContent } from '#/components/ui/card'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from '#/components/ui/field'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import { settingsRowClassName } from '#/components/settings-row'
import { useAccountPreferences } from './use-account-preferences'
import { LoadError } from '#/components/operation-error'

export function ContentEditingPreferences({
  accountId,
}: {
  accountId?: string
}) {
  const { t } = useUiMessages()
  const preferences = useAccountPreferences(accountId)
  return (
    <section aria-labelledby="content-editing-title" className="space-y-3">
      <h2 id="content-editing-title" className="text-base font-medium">
        <UiTrans>Preferences</UiTrans>
      </h2>
      <Card>
        <CardContent>
          <LanguagePreference accountId={accountId} />
          <ThemePreference />
          <Field
            orientation="horizontal"
            className={`${settingsRowClassName} border-b py-4 first:pt-0 last:border-b-0 last:pb-0`}
          >
            <FieldContent>
              <FieldLabel htmlFor="editing-translation">
                <UiTrans>New translations</UiTrans>
              </FieldLabel>
              <FieldDescription id="editing-translation-description">
                <UiTrans>Start blank or copy the current draft.</UiTrans>
              </FieldDescription>
            </FieldContent>
            <Select
              value={
                preferences.ready ? preferences.editing.newTranslations : ''
              }
              disabled={!preferences.canSave || preferences.busy}
              aria-busy={preferences.busy}
              onValueChange={(value) => {
                if (value !== 'ask' && value !== 'blank' && value !== 'copy')
                  return
                void preferences.save(
                  { newTranslations: value },
                  t`Content editing preferences saved`,
                )
              }}
            >
              <SelectTrigger
                className="w-full justify-self-end"
                id="editing-translation"
                aria-describedby="editing-translation-description"
              >
                <SelectValue
                  placeholder={preferences.error ? t`Unavailable` : t`Loading…`}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="ask">
                    <UiTrans>Ask every time</UiTrans>
                  </SelectItem>
                  <SelectItem value="blank">
                    <UiTrans>Start blank</UiTrans>
                  </SelectItem>
                  <SelectItem value="copy">
                    <UiTrans>Copy current language</UiTrans>
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        </CardContent>
      </Card>
      <LoadError
        error={preferences.error}
        message={t`Could not load preferences`}
        stale={preferences.ready}
        onRetry={() => void preferences.retry()}
        retrying={preferences.fetching}
      />
    </section>
  )
}
