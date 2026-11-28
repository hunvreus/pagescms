import { useState } from 'react'
import {
  Trans as UiTrans,
  useLingui as useUiMessages,
} from '@lingui/react/macro'
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

type Theme = 'light' | 'dark' | 'system'

function isTheme(value: string | null): value is Theme {
  return value === 'light' || value === 'dark' || value === 'system'
}

function readTheme(): Theme {
  try {
    const value = window.localStorage.getItem('theme')
    return isTheme(value) ? value : 'system'
  } catch {
    return 'system'
  }
}

export function ThemePreference() {
  const { t } = useUiMessages()
  const [theme, setTheme] = useState<Theme>(readTheme)

  function change(value: string) {
    if (!isTheme(value)) return
    setTheme(value)
    const dark =
      value === 'dark' ||
      (value === 'system' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches)
    document.documentElement.classList.toggle('dark', dark)
    try {
      window.localStorage.setItem('theme', value)
    } catch {
      // Keep the selected theme for this page even if storage is unavailable.
    }
  }

  return (
    <Field
      orientation="horizontal"
      className={`${settingsRowClassName} border-b py-4`}
    >
      <FieldContent>
        <FieldLabel htmlFor="appearance-theme">
          <UiTrans>Color mode</UiTrans>
        </FieldLabel>
        <FieldDescription id="appearance-theme-description">
          <UiTrans>
            Light, dark, or system. Applies only to this browser.
          </UiTrans>
        </FieldDescription>
      </FieldContent>
      <Select value={theme} onValueChange={change}>
        <SelectTrigger
          id="appearance-theme"
          aria-describedby="appearance-theme-description"
          className="w-full justify-self-end"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="system">{t`System`}</SelectItem>
            <SelectItem value="light">{t`Light`}</SelectItem>
            <SelectItem value="dark">{t`Dark`}</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  )
}
